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
      ('expense', 999999, '예정',  'pending', ${foodId},   ${bankId}, '2026-07-20')
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
    expect(recent[0].description).toBe("예정")
    expect(recent[0].account.name).toBe("은행")
    expect(recent[0].tags).toEqual([])
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
