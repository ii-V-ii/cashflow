import { afterAll, beforeEach, describe, expect, test, vi } from "vitest"

const getAuthUserMock = vi.fn(async () => ({
  id: "test-user",
  email: "owner@local.test",
}))

vi.mock("@/server/auth", () => ({
  getAuthUser: () => getAuthUserMock(),
}))

import {
  GET as listTrades,
  POST as postTrade,
} from "@/app/api/v1/investment-trades/route"
import {
  DELETE as deleteTrade,
  GET as getTrade,
  PATCH as patchTrade,
} from "@/app/api/v1/investment-trades/[id]/route"
import { GET as getSummary } from "@/app/api/v1/investment-trades/summary/route"
import { GET as getTickers } from "@/app/api/v1/investment-trades/tickers/route"
import { GET as getAnnual } from "@/app/api/v1/investment-trades/annual/route"
import { closeDb } from "@/server/db/client"

import { createTestDb, truncateAssetInvestmentCore } from "./helpers/db"

const sql = createTestDb()

afterAll(async () => {
  await sql.end()
  await closeDb()
})

let assetId: string

beforeEach(async () => {
  getAuthUserMock.mockResolvedValue({ id: "test-user", email: "owner@local.test" })
  await truncateAssetInvestmentCore(sql)
  const category = await sql`
    INSERT INTO public.asset_categories (name, kind)
    VALUES ('주식', 'financial') RETURNING id
  `
  const asset = await sql`
    INSERT INTO public.assets (name, asset_category_id, acquisition_date, acquisition_cost)
    VALUES ('해외주식', ${category[0].id}, '2026-01-01', 0) RETURNING id
  `
  assetId = asset[0].id as string
})

function jsonRequest(path: string, method: string, body?: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const idParams = (id: string) => ({ params: Promise.resolve({ id }) })

async function createTrade(overrides: Record<string, unknown> = {}) {
  const response = await postTrade(
    jsonRequest("/api/v1/investment-trades", "POST", {
      assetId,
      tradeType: "buy",
      date: "2026-01-05",
      ticker: "AAPL",
      quantity: 10,
      unitPrice: 1000,
      totalAmount: 10_000,
      netAmount: 10_000,
      ...overrides,
    }),
  )
  const body = await response.json()
  return { response, body, id: body.data?.id as string }
}

describe("POST /investment-trades (API.md §11.2)", () => {
  test("buy 생성: remainingQuantity 채워지고 realizedGain은 null", async () => {
    const { response, body } = await createTrade()
    expect(response.status).toBe(201)
    expect(body.data).toMatchObject({
      tradeType: "buy",
      quantity: 10,
      remainingQuantity: 10,
      realizedGain: null,
      asset: { name: "해외주식" },
    })
  })

  test("sell 생성: FIFO realizedGain 포함, buy의 remainingQuantity만 노출", async () => {
    await createTrade()
    const { response, body } = await createTrade({
      tradeType: "sell",
      date: "2026-02-01",
      quantity: 4,
      unitPrice: 0,
      totalAmount: 6_000,
      netAmount: 6_000,
    })
    expect(response.status).toBe(201)
    expect(body.data.realizedGain).toBe(2_000) // 6000 − 4×1000
    expect(body.data.remainingQuantity).toBeNull()
  })

  test("보유수량 초과 매도 422 INSUFFICIENT_HOLDINGS", async () => {
    await createTrade({ quantity: 3, totalAmount: 3_000, netAmount: 3_000 })
    const { response, body } = await createTrade({
      tradeType: "sell",
      quantity: 5,
      totalAmount: 5_000,
      netAmount: 5_000,
    })
    expect(response.status).toBe(422)
    expect(body.error.code).toBe("INSUFFICIENT_HOLDINGS")
  })

  test("없는 자산 참조 404", async () => {
    const { response } = await createTrade({
      assetId: "00000000-0000-0000-0000-000000000000",
    })
    expect(response.status).toBe(404)
  })

  test("잘못된 본문 400", async () => {
    const { response } = await createTrade({ quantity: -1 })
    expect(response.status).toBe(400)
  })
})

describe("GET /investment-trades — 목록·필터 (API.md §11.1)", () => {
  test("페이지네이션 envelope + 최신 날짜 우선", async () => {
    await createTrade({ date: "2026-01-05" })
    await createTrade({ date: "2026-03-01" })

    const response = await listTrades(
      jsonRequest("/api/v1/investment-trades?limit=1", "GET"),
    )
    const body = await response.json()
    expect(body.data.total).toBe(2)
    expect(body.data.items).toHaveLength(1)
    expect(body.data.items[0].date).toBe("2026-03-01")
  })

  test("assetId·기간 필터", async () => {
    await createTrade({ date: "2026-01-05" })
    await createTrade({ date: "2026-06-01" })

    const response = await listTrades(
      jsonRequest(
        `/api/v1/investment-trades?assetId=${assetId}&from=2026-05-01&to=2026-06-30`,
        "GET",
      ),
    )
    const body = await response.json()
    expect(body.data.total).toBe(1)
    expect(body.data.items[0].date).toBe("2026-06-01")
  })

  test("페이지네이션 경계: limit=100 통과·limit=101 거절·마지막 페이지 초과는 빈 배열", async () => {
    await createTrade({ date: "2026-01-05" })
    await createTrade({ date: "2026-01-06" })

    const maxLimit = await listTrades(
      jsonRequest("/api/v1/investment-trades?limit=100", "GET"),
    )
    expect(maxLimit.status).toBe(200)
    expect((await maxLimit.json()).data.items).toHaveLength(2)

    const overLimit = await listTrades(
      jsonRequest("/api/v1/investment-trades?limit=101", "GET"),
    )
    expect(overLimit.status).toBe(400)

    const beyondLast = await listTrades(
      jsonRequest("/api/v1/investment-trades?page=99&limit=20", "GET"),
    )
    const beyondBody = await beyondLast.json()
    expect(beyondLast.status).toBe(200)
    expect(beyondBody.data.items).toEqual([])
    expect(beyondBody.data.page).toBe(99)
    expect(beyondBody.data.total).toBe(2) // 빈 페이지여도 total은 정확해야 함
  })
})

describe("PATCH·DELETE /investment-trades/{id} (API.md §11.4-11.5)", () => {
  test("메모만 수정 가능", async () => {
    const { id } = await createTrade()
    const response = await patchTrade(
      jsonRequest(`/api/v1/investment-trades/${id}`, "PATCH", { memo: "장기 보유" }),
      idParams(id),
    )
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.data.memo).toBe("장기 보유")
  })

  test("FIFO 영향 필드 전달 시 422 IMMUTABLE_TRADE_FIELD", async () => {
    const { id } = await createTrade()
    const response = await patchTrade(
      jsonRequest(`/api/v1/investment-trades/${id}`, "PATCH", {
        memo: "메모",
        quantity: 99,
      }),
      idParams(id),
    )
    const body = await response.json()
    expect(response.status).toBe(422)
    expect(body.error.code).toBe("IMMUTABLE_TRADE_FIELD")
  })

  test("일부 매칭된 buy 삭제 409 TRADE_HAS_DEPENDENTS", async () => {
    const { id: buyId } = await createTrade()
    await createTrade({
      tradeType: "sell",
      date: "2026-02-01",
      quantity: 4,
      totalAmount: 4_000,
      netAmount: 4_000,
    })

    const response = await deleteTrade(
      jsonRequest(`/api/v1/investment-trades/${buyId}`, "DELETE"),
      idParams(buyId),
    )
    const body = await response.json()
    expect(response.status).toBe(409)
    expect(body.error.code).toBe("TRADE_HAS_DEPENDENTS")
  })

  test("sell 삭제는 역FIFO로 로트를 복원한다", async () => {
    const { id: buyId } = await createTrade()
    const { id: sellId } = await createTrade({
      tradeType: "sell",
      date: "2026-02-01",
      quantity: 4,
      totalAmount: 4_000,
      netAmount: 4_000,
    })

    const response = await deleteTrade(
      jsonRequest(`/api/v1/investment-trades/${sellId}`, "DELETE"),
      idParams(sellId),
    )
    expect(response.status).toBe(200)

    const buyResponse = await getTrade(
      jsonRequest(`/api/v1/investment-trades/${buyId}`, "GET"),
      idParams(buyId),
    )
    expect((await buyResponse.json()).data.remainingQuantity).toBe(10)
  })

  test("없는 id 삭제 404", async () => {
    const missing = "00000000-0000-0000-0000-000000000000"
    const response = await deleteTrade(
      jsonRequest(`/api/v1/investment-trades/${missing}`, "DELETE"),
      idParams(missing),
    )
    expect(response.status).toBe(404)
  })
})

describe("summary·tickers·annual (API.md §11.6-11.8)", () => {
  async function seedTrades() {
    await createTrade() // buy 10 × 1000
    await createTrade({
      tradeType: "sell",
      date: "2026-02-01",
      quantity: 5,
      totalAmount: 8_000,
      netAmount: 8_000,
    }) // realized 3000
    await createTrade({
      tradeType: "dividend",
      date: "2026-03-01",
      quantity: 5,
      unitPrice: 0,
      totalAmount: 500,
      netAmount: 500,
    })
    // 매도 완료 종목
    await createTrade({
      ticker: "MSFT",
      date: "2026-01-10",
      quantity: 2,
      unitPrice: 5_000,
      totalAmount: 10_000,
      netAmount: 10_000,
    })
    await createTrade({
      ticker: "MSFT",
      tradeType: "sell",
      date: "2026-04-01",
      quantity: 2,
      totalAmount: 9_000,
      netAmount: 9_000,
    }) // realized -1000
  }

  test("summary 전체 기간: 총계·수익률", async () => {
    await seedTrades()
    const response = await getSummary(
      jsonRequest("/api/v1/investment-trades/summary", "GET"),
    )
    const body = await response.json()
    expect(body.data).toMatchObject({
      totalBuy: 20_000,
      totalSell: 17_000,
      realizedGain: 2_000, // 3000 − 1000
      dividendIncome: 500,
      netProfit: 2_500,
      returnRate: 12.5,
    })
  })

  test("summary 연도 경계 from/to → scope=year 매핑", async () => {
    await seedTrades()
    const response = await getSummary(
      jsonRequest(
        "/api/v1/investment-trades/summary?from=2026-01-01&to=2026-12-31",
        "GET",
      ),
    )
    expect((await response.json()).data.totalBuy).toBe(20_000)
  })

  test("summary 월 경계 from/to → scope=month 매핑 (2월만 집계)", async () => {
    await seedTrades()
    const response = await getSummary(
      jsonRequest(
        "/api/v1/investment-trades/summary?from=2026-02-01&to=2026-02-28",
        "GET",
      ),
    )
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.data).toMatchObject({
      totalBuy: 0, // 2월엔 매수 없음
      totalSell: 8_000,
      realizedGain: 3_000,
      dividendIncome: 0,
    })
  })

  test("경계가 아닌 기간은 400", async () => {
    const response = await getSummary(
      jsonRequest(
        "/api/v1/investment-trades/summary?from=2026-01-03&to=2026-02-11",
        "GET",
      ),
    )
    expect(response.status).toBe(400)
  })

  test("tickers: 보유(AAPL)/매도완료(MSFT) 분리 + 평균단가·수익률", async () => {
    await seedTrades()
    const response = await getTickers(
      jsonRequest("/api/v1/investment-trades/tickers", "GET"),
    )
    const body = await response.json()

    expect(body.data.holding).toHaveLength(1)
    expect(body.data.holding[0]).toMatchObject({
      ticker: "AAPL",
      name: "해외주식",
      quantity: 5,
      avgBuyPrice: 1_000,
      totalBuyAmount: 10_000,
      totalSellAmount: 8_000,
      dividendIncome: 500,
      realizedGain: 3_000,
      returnRate: 35,
    })
    expect(body.data.holding[0].trades).toHaveLength(3)

    expect(body.data.closed).toHaveLength(1)
    expect(body.data.closed[0]).toMatchObject({
      ticker: "MSFT",
      quantity: 0,
      avgBuyPrice: 5_000,
      realizedGain: -1_000,
      returnRate: -10,
    })
  })

  test("annual: 12개월 채움 + 총계", async () => {
    await seedTrades()
    const response = await getAnnual(
      jsonRequest("/api/v1/investment-trades/annual?year=2026", "GET"),
    )
    const body = await response.json()

    expect(body.data.months).toHaveLength(12)
    expect(body.data.months[0]).toMatchObject({ month: 1, investedAmount: 20_000 })
    expect(body.data.months[1]).toMatchObject({ month: 2, realizedGain: 3_000 })
    expect(body.data.months[2]).toMatchObject({ month: 3, dividendIncome: 500 })
    expect(body.data.months[3]).toMatchObject({ month: 4, realizedGain: -1_000 })
    expect(body.data.total).toMatchObject({
      investedAmount: 20_000,
      realizedGain: 2_000,
      dividendIncome: 500,
      returnRate: 12.5,
    })
  })

  test("annual: year 누락 400", async () => {
    const response = await getAnnual(
      jsonRequest("/api/v1/investment-trades/annual", "GET"),
    )
    expect(response.status).toBe(400)
  })
})
