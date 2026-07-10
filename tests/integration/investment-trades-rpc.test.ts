import { afterAll, beforeEach, describe, expect, test } from "vitest"

import { callRpc } from "@/server/rpc"
import { closeDb } from "@/server/db/client"

import { createTestDb, truncateAssetInvestmentCore } from "./helpers/db"

/**
 * Phase 2C 자산·투자 통합 테스트 (docs/DB.md §1.6, §1.9, §2.1-2.3, §2.5, §3.4-3.5, §3.8, §3.13).
 * 로컬 Supabase(127.0.0.1:54322) 대상. FIFO 로트 상태는 RPC 경유로만 변경한다.
 */
const sql = createTestDb()

afterAll(async () => {
  await sql.end()
  await closeDb()
})

beforeEach(async () => {
  await truncateAssetInvestmentCore(sql)
})

// ─── fixtures ────────────────────────────────────────────────

async function createAssetCategory(
  name: string,
  kind: "financial" | "non_financial" = "financial",
): Promise<string> {
  const rows = await sql`
    INSERT INTO public.asset_categories (name, kind)
    VALUES (${name}, ${kind})
    RETURNING id
  `
  return rows[0].id as string
}

async function createAsset(
  name: string,
  categoryId: string,
  acquisitionCost = 0,
): Promise<string> {
  const rows = await sql`
    INSERT INTO public.assets (name, asset_category_id, acquisition_date, acquisition_cost)
    VALUES (${name}, ${categoryId}, '2026-01-01', ${acquisitionCost})
    RETURNING id
  `
  return rows[0].id as string
}

async function createAccount(
  name: string,
  initialBalance: number,
  assetId: string | null = null,
): Promise<string> {
  const rows = await sql`
    INSERT INTO public.accounts (name, type, initial_balance, asset_id)
    VALUES (${name}, 'investment', ${initialBalance}, ${assetId})
    RETURNING id
  `
  return rows[0].id as string
}

interface TradePayload {
  asset_id: string
  trade_type: "buy" | "sell" | "dividend"
  date: string
  ticker?: string | null
  quantity: number
  unit_price: number
  total_amount: number
  fee?: number
  tax?: number
  net_amount: number
  memo?: string | null
  account_id?: string | null
}

interface TradeRow {
  id: string
  trade_type: string
  remaining_quantity: string | number
  realized_gain: string | number
}

/** 복합 타입 반환 RPC는 SELECT * FROM fn() 으로 소비 (transaction-service 패턴) */
async function createTrade(payload: TradePayload): Promise<TradeRow> {
  const rows = await sql`
    SELECT * FROM public.create_investment_trade(${sql.json(payload as never)})
  `
  expect(rows).toHaveLength(1)
  return rows[0] as unknown as TradeRow
}

function buyPayload(
  assetId: string,
  date: string,
  quantity: number,
  unitPrice: number,
  overrides: Partial<TradePayload> = {},
): TradePayload {
  const total = Math.round(quantity * unitPrice)
  return {
    asset_id: assetId,
    trade_type: "buy",
    date,
    ticker: "AAPL",
    quantity,
    unit_price: unitPrice,
    total_amount: total,
    net_amount: total,
    ...overrides,
  }
}

function sellPayload(
  assetId: string,
  date: string,
  quantity: number,
  netAmount: number,
  overrides: Partial<TradePayload> = {},
): TradePayload {
  return {
    asset_id: assetId,
    trade_type: "sell",
    date,
    ticker: "AAPL",
    quantity,
    unit_price: 0,
    total_amount: netAmount,
    net_amount: netAmount,
    ...overrides,
  }
}

async function remainingOf(tradeId: string): Promise<number> {
  const rows = await sql`
    SELECT remaining_quantity FROM public.investment_trades WHERE id = ${tradeId}
  `
  expect(rows).toHaveLength(1)
  return Number(rows[0].remaining_quantity)
}

async function accountBalance(accountId: string): Promise<number> {
  const rows = await sql`
    SELECT current_balance FROM public.account_balances_v WHERE account_id = ${accountId}
  `
  expect(rows).toHaveLength(1)
  return Number(rows[0].current_balance)
}

// ─── create_investment_trade ─────────────────────────────────

describe("create_investment_trade — FIFO 차감·실현손익 (DB.md §3.4)", () => {
  test("buy는 remaining_quantity = quantity 로트를 만든다", async () => {
    const categoryId = await createAssetCategory("주식")
    const assetId = await createAsset("해외주식", categoryId)

    const row = await createTrade(buyPayload(assetId, "2026-01-05", 10, 1000))

    expect(Number(row.remaining_quantity)).toBe(10)
    expect(Number(row.realized_gain)).toBe(0)
  })

  test("sell은 (date, id) 오름차순 FIFO로 차감하고 realized_gain을 계산한다", async () => {
    const categoryId = await createAssetCategory("주식")
    const assetId = await createAsset("해외주식", categoryId)
    const lot1 = await createTrade(buyPayload(assetId, "2026-01-01", 10, 1000))
    const lot2 = await createTrade(buyPayload(assetId, "2026-01-05", 10, 2000))

    // 15주 매도: lot1 10주(원가 10000) + lot2 5주(원가 10000) = 20000
    const sell = await createTrade(sellPayload(assetId, "2026-02-01", 15, 26000))

    expect(Number(sell.realized_gain)).toBe(6000)
    expect(await remainingOf(lot1.id)).toBe(0)
    expect(await remainingOf(lot2.id)).toBe(5)
  })

  test("다른 ticker의 로트는 차감하지 않는다 (NULL은 NULL끼리 매칭)", async () => {
    const categoryId = await createAssetCategory("주식")
    const assetId = await createAsset("해외주식", categoryId)
    const aapl = await createTrade(buyPayload(assetId, "2026-01-01", 10, 1000))
    const nullLot = await createTrade(
      buyPayload(assetId, "2026-01-01", 10, 1000, { ticker: null }),
    )

    await createTrade(sellPayload(assetId, "2026-02-01", 5, 5000, { ticker: null }))

    expect(await remainingOf(aapl.id)).toBe(10)
    expect(await remainingOf(nullLot.id)).toBe(5)
  })

  test("보유수량 초과 매도는 CF423으로 거부되고 전체 롤백된다", async () => {
    const categoryId = await createAssetCategory("주식")
    const assetId = await createAsset("해외주식", categoryId)
    const lot = await createTrade(buyPayload(assetId, "2026-01-01", 3, 1000))

    await expect(
      createTrade(sellPayload(assetId, "2026-02-01", 5, 5000)),
    ).rejects.toMatchObject({ code: "CF423" })

    expect(await remainingOf(lot.id)).toBe(3)
    const count = await sql`SELECT count(*)::int AS n FROM public.investment_trades`
    expect(count[0].n).toBe(1) // 매도 INSERT 도 롤백
  })

  test("잘못된 trade_type/수량은 CF400", async () => {
    const categoryId = await createAssetCategory("주식")
    const assetId = await createAsset("해외주식", categoryId)

    await expect(
      createTrade({
        ...buyPayload(assetId, "2026-01-01", 10, 1000),
        trade_type: "invalid" as never,
      }),
    ).rejects.toMatchObject({ code: "CF400" })

    await expect(
      createTrade(buyPayload(assetId, "2026-01-01", 0, 1000, { quantity: 0 })),
    ).rejects.toMatchObject({ code: "CF400" })
  })

  test("dividend는 로트에 영향 없이 기록된다", async () => {
    const categoryId = await createAssetCategory("주식")
    const assetId = await createAsset("해외주식", categoryId)
    const lot = await createTrade(buyPayload(assetId, "2026-01-01", 10, 1000))

    const dividend = await createTrade({
      asset_id: assetId,
      trade_type: "dividend",
      date: "2026-03-01",
      ticker: "AAPL",
      quantity: 10,
      unit_price: 0,
      total_amount: 300,
      net_amount: 300,
    })

    expect(Number(dividend.remaining_quantity)).toBe(0)
    expect(Number(dividend.realized_gain)).toBe(0)
    expect(await remainingOf(lot.id)).toBe(10)
  })

  test("소수 수량 실현손익 반올림은 half away from zero (PG round)", async () => {
    const categoryId = await createAssetCategory("주식")
    const assetId = await createAsset("해외주식", categoryId)
    await createTrade(buyPayload(assetId, "2026-01-01", 1, 1001))

    // 원가 = 0.5 × 1001 = 500.5 → gain = 498 − 500.5 = −2.5 → −3
    const sell = await createTrade(sellPayload(assetId, "2026-02-01", 0.5, 498))

    expect(Number(sell.realized_gain)).toBe(-3)
  })
})

// ─── delete_investment_trade ─────────────────────────────────

describe("delete_investment_trade — 역FIFO 복원·가드 (DB.md §3.5)", () => {
  test("sell 삭제는 최근 차감 로트(date DESC)부터 복원한다", async () => {
    const categoryId = await createAssetCategory("주식")
    const assetId = await createAsset("해외주식", categoryId)
    const lot1 = await createTrade(buyPayload(assetId, "2026-01-01", 10, 1000))
    const lot2 = await createTrade(buyPayload(assetId, "2026-01-05", 10, 2000))
    const sell = await createTrade(sellPayload(assetId, "2026-02-01", 15, 30000))

    const deleted = await callRpc<boolean>("delete_investment_trade", { p_id: sell.id })

    expect(deleted).toBe(true)
    expect(await remainingOf(lot1.id)).toBe(10)
    expect(await remainingOf(lot2.id)).toBe(10)
  })

  test("일부 매칭된 buy 삭제는 CF409로 거부된다 (매칭 로트 삭제 금지 가드)", async () => {
    const categoryId = await createAssetCategory("주식")
    const assetId = await createAsset("해외주식", categoryId)
    const lot = await createTrade(buyPayload(assetId, "2026-01-01", 10, 1000))
    await createTrade(sellPayload(assetId, "2026-02-01", 4, 4000))

    await expect(
      callRpc("delete_investment_trade", { p_id: lot.id }),
    ).rejects.toMatchObject({ code: "CF409" })

    expect(await remainingOf(lot.id)).toBe(6)
  })

  test("매칭되지 않은 buy와 dividend는 삭제된다", async () => {
    const categoryId = await createAssetCategory("주식")
    const assetId = await createAsset("해외주식", categoryId)
    const lot = await createTrade(buyPayload(assetId, "2026-01-01", 10, 1000))

    expect(await callRpc<boolean>("delete_investment_trade", { p_id: lot.id })).toBe(true)
    const count = await sql`SELECT count(*)::int AS n FROM public.investment_trades`
    expect(count[0].n).toBe(0)
  })

  test("없는 id는 false를 반환한다", async () => {
    const missing = "00000000-0000-0000-0000-000000000000"
    expect(await callRpc<boolean>("delete_investment_trade", { p_id: missing })).toBe(
      false,
    )
  })
})

// ─── 뷰 ──────────────────────────────────────────────────────

describe("잔액·자산 뷰 (DB.md §2.1-2.3, §2.5)", () => {
  test("account_balances_v: buy −total_amount, sell/dividend +net_amount", async () => {
    const categoryId = await createAssetCategory("주식")
    const assetId = await createAsset("해외주식", categoryId)
    const accountId = await createAccount("증권계좌", 100_000)

    await createTrade(
      buyPayload(assetId, "2026-01-01", 10, 1000, { account_id: accountId }),
    )
    expect(await accountBalance(accountId)).toBe(90_000)

    await createTrade(
      sellPayload(assetId, "2026-02-01", 5, 8000, { account_id: accountId }),
    )
    expect(await accountBalance(accountId)).toBe(98_000)

    await createTrade({
      asset_id: assetId,
      trade_type: "dividend",
      date: "2026-03-01",
      ticker: "AAPL",
      quantity: 5,
      unit_price: 0,
      total_amount: 500,
      net_amount: 500,
      account_id: accountId,
    })
    expect(await accountBalance(accountId)).toBe(98_500)
  })

  test("open_lots_v는 잔여 수량 있는 buy만 노출한다", async () => {
    const categoryId = await createAssetCategory("주식")
    const assetId = await createAsset("해외주식", categoryId)
    await createTrade(buyPayload(assetId, "2026-01-01", 10, 1000))
    await createTrade(sellPayload(assetId, "2026-02-01", 10, 12000))
    const openLot = await createTrade(buyPayload(assetId, "2026-03-01", 4, 2000))

    const rows = await sql`
      SELECT trade_id, remaining_quantity, remaining_cost
      FROM public.open_lots_v WHERE asset_id = ${assetId}
    `
    expect(rows).toHaveLength(1)
    expect(rows[0].trade_id).toBe(openLot.id)
    expect(Number(rows[0].remaining_cost)).toBe(8000)
  })

  test("asset_values_v: 연결 계좌 잔액 + 보유 로트 원가 합", async () => {
    const categoryId = await createAssetCategory("주식")
    const assetId = await createAsset("해외주식", categoryId)
    await createAccount("증권계좌", 50_000, assetId)
    await createTrade(buyPayload(assetId, "2026-01-01", 10, 1000))

    const rows = await sql`
      SELECT current_value FROM public.asset_values_v WHERE asset_id = ${assetId}
    `
    expect(Number(rows[0].current_value)).toBe(60_000)
  })

  test("asset_values_v: 미연결 자산은 최신 평가액, 없으면 취득원가", async () => {
    const categoryId = await createAssetCategory("부동산", "non_financial")
    const assetId = await createAsset("아파트", categoryId, 500_000)

    const before = await sql`
      SELECT current_value FROM public.asset_values_v WHERE asset_id = ${assetId}
    `
    expect(Number(before[0].current_value)).toBe(500_000)

    await sql`
      INSERT INTO public.asset_valuations (asset_id, date, value, source)
      VALUES (${assetId}, '2026-06-01', 550000, 'manual'),
             (${assetId}, '2026-07-01', 560000, 'manual')
    `
    const after = await sql`
      SELECT current_value FROM public.asset_values_v WHERE asset_id = ${assetId}
    `
    expect(Number(after[0].current_value)).toBe(560_000)
  })

  test("monthly_investment_summary_v: 월별 매수/매도/배당/실현손익", async () => {
    const categoryId = await createAssetCategory("주식")
    const assetId = await createAsset("해외주식", categoryId)
    await createTrade(buyPayload(assetId, "2026-01-10", 10, 1000))
    await createTrade(sellPayload(assetId, "2026-01-20", 5, 8000))

    const rows = await sql`
      SELECT invested_amount, sold_amount, realized_gain
      FROM public.monthly_investment_summary_v
      WHERE asset_id = ${assetId} AND year = 2026 AND month = 1
    `
    expect(rows).toHaveLength(1)
    expect(Number(rows[0].invested_amount)).toBe(10_000)
    expect(Number(rows[0].sold_amount)).toBe(8_000)
    expect(Number(rows[0].realized_gain)).toBe(3_000) // 8000 − 5×1000
  })
})

// ─── get_investment_summary / snapshot ───────────────────────

describe("get_investment_summary (DB.md §3.13)", () => {
  test("scope=all: 전체 집계와 자산별 보유 현황", async () => {
    const categoryId = await createAssetCategory("주식")
    const assetId = await createAsset("해외주식", categoryId)
    await createTrade(buyPayload(assetId, "2026-01-01", 10, 1000))
    await createTrade(sellPayload(assetId, "2026-02-01", 5, 8000))
    await createTrade({
      asset_id: assetId,
      trade_type: "dividend",
      date: "2026-03-01",
      ticker: "AAPL",
      quantity: 5,
      unit_price: 0,
      total_amount: 500,
      net_amount: 500,
    })

    const result = await callRpc<{
      total: Record<string, number>
      assets: Array<Record<string, unknown>>
    }>("get_investment_summary", { p_scope: "all" })

    expect(result.total.total_buy).toBe(10_000)
    expect(result.total.total_sell).toBe(8_000)
    expect(result.total.realized_gain).toBe(3_000)
    expect(result.total.dividend_income).toBe(500)
    expect(result.total.net_profit).toBe(3_500)
    expect(result.total.return_rate).toBe(35)
    expect(result.assets).toHaveLength(1)
    expect(Number(result.assets[0].holding_qty)).toBe(5)
    expect(Number(result.assets[0].avg_buy_price)).toBe(1000)
  })

  test("scope=year: 해당 연도 기록만 집계한다", async () => {
    const categoryId = await createAssetCategory("주식")
    const assetId = await createAsset("해외주식", categoryId)
    await createTrade(buyPayload(assetId, "2025-06-01", 10, 1000))
    await createTrade(buyPayload(assetId, "2026-06-01", 10, 2000))

    const result = await callRpc<{ total: Record<string, number> }>(
      "get_investment_summary",
      { p_scope: "year", p_year: 2026 },
    )
    expect(result.total.total_buy).toBe(20_000)
  })

  test("잘못된 scope는 CF400", async () => {
    await expect(
      callRpc("get_investment_summary", { p_scope: "week" }),
    ).rejects.toMatchObject({ code: "CF400" })
  })

  test("기록이 없으면 0 합계와 빈 assets 배열", async () => {
    const result = await callRpc<{
      total: Record<string, number>
      assets: unknown[]
    }>("get_investment_summary", { p_scope: "all" })
    expect(result.total.total_buy).toBe(0)
    expect(result.total.return_rate).toBe(0)
    expect(result.assets).toEqual([])
  })
})

describe("snapshot_asset_valuations (DB.md §3.8)", () => {
  test("활성 자산의 현재가치를 auto로 기록하고 manual은 보존한다", async () => {
    const categoryId = await createAssetCategory("주식")
    const autoAsset = await createAsset("자동자산", categoryId, 10_000)
    const manualAsset = await createAsset("수동자산", categoryId, 20_000)
    await sql`
      INSERT INTO public.asset_valuations (asset_id, date, value, source)
      VALUES (${manualAsset}, '2026-07-10', 999, 'manual')
    `

    const count = await callRpc<number>("snapshot_asset_valuations", {
      p_date: "2026-07-10",
    })

    // manual 충돌 1건은 보존(업데이트 제외) → auto 기록은 autoAsset 1건
    expect(count).toBe(1)
    const autoRows = await sql`
      SELECT value, source FROM public.asset_valuations
      WHERE asset_id = ${autoAsset} AND date = '2026-07-10'
    `
    expect(autoRows).toHaveLength(1)
    expect(Number(autoRows[0].value)).toBe(10_000)
    expect(autoRows[0].source).toBe("auto")

    const manualRows = await sql`
      SELECT value, source FROM public.asset_valuations
      WHERE asset_id = ${manualAsset} AND date = '2026-07-10'
    `
    expect(Number(manualRows[0].value)).toBe(999)
    expect(manualRows[0].source).toBe("manual")
  })

  test("멱등: 같은 날 재실행 시 auto 값을 갱신한다", async () => {
    const categoryId = await createAssetCategory("주식")
    const assetId = await createAsset("자동자산", categoryId, 10_000)

    await callRpc("snapshot_asset_valuations", { p_date: "2026-07-10" })
    await createTrade(buyPayload(assetId, "2026-07-10", 10, 1000))
    const count = await callRpc<number>("snapshot_asset_valuations", {
      p_date: "2026-07-10",
    })

    expect(count).toBe(1)
    const rows = await sql`
      SELECT value FROM public.asset_valuations
      WHERE asset_id = ${assetId} AND date = '2026-07-10'
    `
    expect(Number(rows[0].value)).toBe(10_000) // 계좌 미연결 + 로트 10,000
  })
})

// ─── FIFO 이중 방어 ──────────────────────────────────────────

describe("FIFO 파생 컬럼 이중 방어 (DB.md §5)", () => {
  test("CHECK: remaining_quantity > quantity 는 거부된다", async () => {
    const categoryId = await createAssetCategory("주식")
    const assetId = await createAsset("해외주식", categoryId)
    const lot = await createTrade(buyPayload(assetId, "2026-01-01", 10, 1000))

    await expect(
      sql`UPDATE public.investment_trades SET remaining_quantity = 11 WHERE id = ${lot.id}`,
    ).rejects.toThrow()
  })

  test("CHECK: sell 이외의 realized_gain ≠ 0 은 거부된다", async () => {
    const categoryId = await createAssetCategory("주식")
    const assetId = await createAsset("해외주식", categoryId)
    const lot = await createTrade(buyPayload(assetId, "2026-01-01", 10, 1000))

    await expect(
      sql`UPDATE public.investment_trades SET realized_gain = 100 WHERE id = ${lot.id}`,
    ).rejects.toThrow()
  })
})
