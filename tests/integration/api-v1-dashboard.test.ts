import { afterAll, beforeEach, describe, expect, test, vi } from "vitest"

const getAuthUserMock = vi.fn(async () => ({
  id: "test-user",
  email: "owner@local.test",
}))

vi.mock("@/server/auth", () => ({
  getAuthUser: () => getAuthUserMock(),
}))

import { GET as getDashboard } from "@/app/api/v1/dashboard/route"
import { closeDb } from "@/server/db/client"

import {
  createTestDb,
  truncateAssetInvestmentCore,
  truncateBudgets,
  truncateTransactionCore,
} from "./helpers/db"

/**
 * REST /api/v1/dashboard 통합 테스트 (API.md §8.1) — get_dashboard RPC 1왕복.
 * 캘린더 applied만 / 예산 소진율·투자 요약·순자산(Phase 2 통합) / 최근 거래 5건.
 */
const sql = createTestDb()

afterAll(async () => {
  await sql.end()
  await closeDb()
})

let bankId: string
let foodId: string
let salaryId: string

beforeEach(async () => {
  getAuthUserMock.mockResolvedValue({ id: "test-user", email: "owner@local.test" })
  await truncateBudgets(sql)
  await truncateAssetInvestmentCore(sql)
  await truncateTransactionCore(sql)

  const accounts = await sql`
    INSERT INTO public.accounts (name, type, initial_balance, sort_order, is_active) VALUES
      ('은행', 'bank', 100000, 0, true),
      ('비활성', 'bank', 999999, 1, false)
    RETURNING id
  `
  bankId = accounts[0].id

  const categories = await sql`
    INSERT INTO public.categories (name, type, expense_kind) VALUES
      ('식비', 'expense', 'consumption'),
      ('급여', 'income', NULL)
    RETURNING id
  `
  foodId = categories[0].id
  salaryId = categories[1].id

  await sql`
    INSERT INTO public.transactions
      (type, amount, description, status, category_id, account_id, date)
    VALUES
      ('income',  500000, '급여',  'applied', ${salaryId}, ${bankId}, '2026-07-01'),
      ('expense',  30000, '식비1', 'applied', ${foodId},   ${bankId}, '2026-07-03'),
      ('expense',  20000, '식비2', 'applied', ${foodId},   ${bankId}, '2026-07-03'),
      -- 먼 미래(오늘 기준 항상 미래) pending — get_dashboard.recent_transactions가
      -- 미래 날짜를 배제하는지 검증하는 시드. 2026-07의 결산/캘린더 집계에는
      -- status='pending'이라 애초에 잡히지 않으므로 다른 테스트에 영향 없다.
      ('expense', 999999, '예정',  'pending', ${foodId},   ${bankId}, '2099-07-20')
  `
})

async function fetchDashboard(query = "?year=2026&month=7") {
  const response = await getDashboard(
    new Request(`http://localhost/api/v1/dashboard${query}`),
  )
  return { status: response.status, body: await response.json() }
}

describe("GET /api/v1/dashboard", () => {
  test("요약·캘린더·최근 거래를 1왕복으로 돌려준다", async () => {
    const { status, body } = await fetchDashboard()

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    // 총잔액: 활성 계좌만, applied만 — 100,000 + 500,000 - 50,000
    expect(body.data.totalBalance).toBe(550000)
    expect(body.data.accountCount).toBe(1)
    expect(body.data.monthlyIncome).toBe(500000)
    expect(body.data.monthlyExpense).toBe(50000)
  })

  test("캘린더는 applied 거래만 일자별 합산한다 (pending 제외)", async () => {
    const { body } = await fetchDashboard()

    expect(body.data.dailyTotals).toEqual([
      { date: "2026-07-01", income: 500000, expense: 0 },
      { date: "2026-07-03", income: 0, expense: 50000 },
    ])
  })

  test("자산·해당 월 예산이 없으면 budget/investment 는 null (빈 상태)", async () => {
    const { body } = await fetchDashboard()

    expect(body.data.budget).toBeNull()
    expect(body.data.investment).toBeNull()
    // 자산 없음 → 순자산 = 활성 계좌 잔액 합
    expect(body.data.netWorth).toBe(550000)
  })

  test("예산·자산·매매 시드 시 소진율·투자 요약·순자산을 계산한다", async () => {
    // 예산: 식비 지출 계획 200,000 → 실지출 50,000 = 25.0%
    const [budget] = await sql`
      INSERT INTO public.budgets (name, year, month)
      VALUES ('2026-07 예산', 2026, 7) RETURNING id
    `
    await sql`
      INSERT INTO public.budget_items (budget_id, category_id, planned_amount)
      VALUES (${budget.id}, ${foodId}, 200000)
    `

    // 자산: 펀드(최신 평가 1,200,000) + 연금(연동 계좌 500,000)
    const [assetCategory] = await sql`
      INSERT INTO public.asset_categories (name, kind)
      VALUES ('금융자산', 'financial') RETURNING id
    `
    const assets = await sql`
      INSERT INTO public.assets
        (name, asset_category_id, acquisition_date, acquisition_cost) VALUES
        ('펀드', ${assetCategory.id}, '2026-01-01', 1000000),
        ('연금', ${assetCategory.id}, '2026-01-01', 400000)
      RETURNING id
    `
    await sql`
      INSERT INTO public.asset_valuations (asset_id, date, value)
      VALUES (${assets[0].id}, '2026-07-01', 1200000)
    `
    await sql`
      INSERT INTO public.accounts (name, type, initial_balance, sort_order, asset_id)
      VALUES ('연금계좌', 'investment', 500000, 9, ${assets[1].id})
    `
    // 매매: 7월 매수 500,000 / 매도 net 297,000(실현손익 47,000) / 배당 10,000
    await sql`
      INSERT INTO public.investment_trades
        (asset_id, trade_type, date, quantity, unit_price, total_amount,
         fee, tax, net_amount, realized_gain) VALUES
        (${assets[0].id}, 'buy',      '2026-07-02', 10, 50000, 500000, 0,    0, 500000, 0),
        (${assets[0].id}, 'sell',     '2026-07-15',  5, 60000, 300000, 3000, 0, 297000, 47000),
        (${assets[0].id}, 'dividend', '2026-07-20',  1, 10000,  10000, 0,    0,  10000, 0)
    `

    const { body } = await fetchDashboard()

    expect(body.data.budget).toEqual({
      plannedTotal: 200000,
      actualTotal: 50000,
      ratio: 25,
    })
    expect(body.data.investment).toEqual({
      totalValue: 1700000, // 펀드 1,200,000 + 연금 500,000(연동 계좌)
      invested: 500000,
      sold: 297000,
      dividend: 10000,
      realizedGain: 47000,
    })
    // 순자산 = 미연동 계좌 550,000 + 자산 1,700,000 (연동 계좌 이중 계상 없음)
    expect(body.data.netWorth).toBe(2250000)
    // 총잔액은 연동 계좌 포함: 550,000 + 500,000
    expect(body.data.totalBalance).toBe(1050000)
  })

  test("최근 거래는 Transaction DTO 형태로 최신순", async () => {
    const { body } = await fetchDashboard()

    const recent = body.data.recentTransactions
    expect(recent.length).toBeGreaterThan(0)
    // '예정'(2099-07-20, pending)은 2026-07 밖의 먼 미래 날짜로 시드되어
    // recent_transactions(선택 월 + 오늘 이하)에서 항상 배제된다 — 미래/월외
    // 배제 자체는 아래 전용 테스트에서 검증하고, 여기서는 DTO 형태만 확인한다.
    // 동률(식비1·식비2 동일 날짜) 순서는 단일 INSERT 문 내 created_at이 동일할
    // 수 있어 보장되지 않으므로 recent[0]의 정확한 식별자는 단언하지 않는다.
    expect(recent.some((tx: { description: string }) => tx.description === "예정")).toBe(
      false,
    )
    expect(["식비1", "식비2"]).toContain(recent[0].description)
    expect(recent[0].account.name).toBe("은행")
    expect(recent[0].tags).toEqual([])
  })

  test("최근 거래는 선택 월(v_start~v_end) 내 + 오늘(KST) 이하 날짜만 반환한다 (미래·월외 배제)", async () => {
    // 실행 시점에 독립적으로 만들기 위해 DB의 "KST 오늘"을 조회해 기준으로 삼는다
    // (recurring-rpc.test.ts와 동일 패턴 — 실행 시점 독립).
    const [{ today, y, m }] = await sql`
      SELECT
        to_char((now() AT TIME ZONE 'Asia/Seoul')::date, 'YYYY-MM-DD')   AS today,
        EXTRACT(YEAR  FROM (now() AT TIME ZONE 'Asia/Seoul')::date)::int AS y,
        EXTRACT(MONTH FROM (now() AT TIME ZONE 'Asia/Seoul')::date)::int AS m
    `

    // accounts/categories는 유지한 채 거래만 초기화 (bankId/foodId 재사용)
    await sql`TRUNCATE TABLE public.transaction_tags, public.transactions CASCADE`
    await sql`
      INSERT INTO public.transactions
        (type, amount, description, status, category_id, account_id, date) VALUES
        ('expense', 10000, '오늘거래',   'applied', ${foodId}, ${bankId}, ${today}::date),
        ('expense', 20000, '미래거래',   'pending', ${foodId}, ${bankId}, (${today}::date + 1)),
        ('expense', 30000, '지난달거래', 'applied', ${foodId}, ${bankId},
          (date_trunc('month', ${today}::date)::date - 1))
    `

    const { body } = await fetchDashboard(`?year=${y}&month=${m}`)
    const recent = body.data.recentTransactions
    const descriptions = recent.map((tx: { description: string }) => tx.description)

    expect(descriptions).toContain("오늘거래")
    expect(descriptions).not.toContain("미래거래")
    expect(descriptions).not.toContain("지난달거래")

    const todayTx = recent.find(
      (tx: { description: string }) => tx.description === "오늘거래",
    )
    expect(todayTx.account.name).toBe("은행")
    expect(todayTx.tags).toEqual([])
  })

  test("year/month 미지정 시 현재 연·월 기본값으로 200", async () => {
    const { status, body } = await fetchDashboard("")

    expect(status).toBe(200)
    expect(body.success).toBe(true)
  })

  test("검증 실패 — month=0 은 400", async () => {
    const { status } = await fetchDashboard("?year=2026&month=0")
    expect(status).toBe(400)
  })
})
