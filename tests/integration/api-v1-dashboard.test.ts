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

import { createTestDb, truncateTransactionCore } from "./helpers/db"

/**
 * REST /api/v1/dashboard 통합 테스트 (API.md §8.1) — get_dashboard RPC 1왕복.
 * 캘린더 applied만 / 예산·투자 null placeholder / 최근 거래 5건.
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

  test("예산·투자 위젯은 타 트랙 랜딩 전까지 null placeholder", async () => {
    const { body } = await fetchDashboard()

    expect(body.data.budget).toBeNull()
    expect(body.data.investment).toBeNull()
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
