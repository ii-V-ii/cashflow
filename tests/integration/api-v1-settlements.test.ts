import { afterAll, beforeEach, describe, expect, test, vi } from "vitest"

const getAuthUserMock = vi.fn(async () => ({
  id: "test-user",
  email: "owner@local.test",
}))

vi.mock("@/server/auth", () => ({
  getAuthUser: () => getAuthUserMock(),
}))

import { GET as getMonthly } from "@/app/api/v1/settlements/monthly/route"
import { GET as getAnnual } from "@/app/api/v1/settlements/annual/route"
import { closeDb } from "@/server/db/client"

import { createTestDb, truncateTransactionCore } from "./helpers/db"

/**
 * REST /api/v1/settlements 통합 테스트 (API.md §7) — 로컬 Supabase 대상.
 * 도메인 규칙: 저축 포함 / applied만 / 대분류 롤업 / 전월 비교 / 배당 미포함(테이블 부재).
 */
const sql = createTestDb()

afterAll(async () => {
  await sql.end()
  await closeDb()
})

let bankId: string
let savingsId: string
let foodId: string
let diningOutId: string
let savingId: string
let salaryId: string

beforeEach(async () => {
  getAuthUserMock.mockResolvedValue({ id: "test-user", email: "owner@local.test" })
  await truncateTransactionCore(sql)

  const accounts = await sql`
    INSERT INTO public.accounts (name, type, initial_balance, sort_order) VALUES
      ('은행', 'bank', 100000, 0),
      ('적금', 'savings', 0, 1)
    RETURNING id
  `
  bankId = accounts[0].id
  savingsId = accounts[1].id

  const parents = await sql`
    INSERT INTO public.categories (name, type, expense_kind) VALUES
      ('식비', 'expense', 'consumption'),
      ('저축', 'expense', 'saving'),
      ('급여', 'income', NULL)
    RETURNING id
  `
  foodId = parents[0].id
  savingId = parents[1].id
  salaryId = parents[2].id

  const children = await sql`
    INSERT INTO public.categories (name, type, expense_kind, parent_id)
    VALUES ('외식', 'expense', 'consumption', ${foodId})
    RETURNING id
  `
  diningOutId = children[0].id

  await sql`
    INSERT INTO public.transactions
      (type, amount, description, status, category_id, account_id, to_account_id, date)
    VALUES
      -- 6월(전월): 수입 300,000 / 지출 50,000
      ('income',  300000, '전월급여', 'applied', ${salaryId}, ${bankId}, NULL, '2026-06-05'),
      ('expense',  50000, '전월식비', 'applied', ${foodId},   ${bankId}, NULL, '2026-06-10'),
      -- 7월: 수입 500,000 / 식비 30,000 + 외식(소분류) 20,000 / 저축 100,000
      ('income',  500000, '급여',   'applied', ${salaryId}, ${bankId}, NULL, '2026-07-01'),
      ('expense',  30000, '장보기', 'applied', ${foodId},   ${bankId}, NULL, '2026-07-03'),
      ('expense',  20000, '외식',   'applied', ${diningOutId}, ${bankId}, NULL, '2026-07-05'),
      ('expense', 100000, '적금',   'applied', ${savingId}, ${bankId}, ${savingsId}, '2026-07-10'),
      -- pending: 결산 제외
      ('expense', 999999, '예정',   'pending', ${foodId},   ${bankId}, NULL, '2026-07-20')
  `
})

async function fetchMonthly(year: number, month: number) {
  const response = await getMonthly(
    new Request(`http://localhost/api/v1/settlements/monthly?year=${year}&month=${month}`),
  )
  return { status: response.status, body: await response.json() }
}

describe("GET /api/v1/settlements/monthly", () => {
  test("저축 포함·pending 제외 합계와 순수익을 돌려준다", async () => {
    const { status, body } = await fetchMonthly(2026, 7)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.income.total).toBe(500000)
    expect(body.data.expense.total).toBe(150000)
    expect(body.data.net).toBe(350000)
    expect(body.data.expense.savingTotal).toBe(100000)
    expect(body.data.expense.consumptionTotal).toBe(50000)
  })

  test("소분류는 대분류로 롤업되고 구성비가 계산된다", async () => {
    const { body } = await fetchMonthly(2026, 7)

    const byCategory = body.data.expense.byCategory
    expect(byCategory).toHaveLength(2)

    const food = byCategory.find(
      (item: { name: string }) => item.name === "식비",
    )
    expect(food.amount).toBe(50000) // 30,000 + 외식 20,000
    expect(food.categoryId).toBe(foodId)
    expect(food.ratio).toBeCloseTo(33.3, 1)

    const saving = byCategory.find(
      (item: { name: string }) => item.name === "저축",
    )
    expect(saving.expenseKind).toBe("saving")
    expect(saving.ratio).toBeCloseTo(66.7, 1)
  })

  test("계좌별 기초/기말 잔액과 증감을 돌려준다", async () => {
    const { body } = await fetchMonthly(2026, 7)

    const bank = body.data.accounts.find(
      (item: { name: string }) => item.name === "은행",
    )
    // 기초 = 100,000 + (300,000 - 50,000) = 350,000 / 기말 = +500,000 -150,000
    expect(bank.openingBalance).toBe(350000)
    expect(bank.closingBalance).toBe(700000)
    expect(bank.change).toBe(350000)

    const savings = body.data.accounts.find(
      (item: { name: string }) => item.name === "적금",
    )
    expect(savings.closingBalance).toBe(100000) // 저축 입금 반영
  })

  test("전월 대비 증감을 돌려준다", async () => {
    const { body } = await fetchMonthly(2026, 7)

    expect(body.data.momComparison).toEqual({
      incomeDiff: 200000, // 500,000 - 300,000
      expenseDiff: 100000, // 150,000 - 50,000
      netDiff: 100000, // 350,000 - 250,000
    })
  })

  test("거래 없는 달은 0 합계와 빈 배열을 돌려준다", async () => {
    const { status, body } = await fetchMonthly(2025, 1)

    expect(status).toBe(200)
    expect(body.data.income.total).toBe(0)
    expect(body.data.expense.total).toBe(0)
    expect(body.data.income.byCategory).toEqual([])
  })

  test("검증 실패 — month 범위 밖은 400", async () => {
    const { status, body } = await fetchMonthly(2026, 13)

    expect(status).toBe(400)
    expect(body.success).toBe(false)
  })
})

describe("GET /api/v1/settlements/annual", () => {
  test("12개월 고정 배열 + 연간 합계 + 카테고리 집계를 1왕복으로 돌려준다", async () => {
    const response = await getAnnual(
      new Request("http://localhost/api/v1/settlements/annual?year=2026"),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.year).toBe(2026)
    expect(body.data.months).toHaveLength(12)

    const july = body.data.months[6]
    expect(july).toEqual({
      month: 7,
      income: 500000,
      expense: 150000,
      saving: 100000,
      net: 350000,
    })
    // 거래 없는 달은 0
    expect(body.data.months[0]).toEqual({
      month: 1,
      income: 0,
      expense: 0,
      saving: 0,
      net: 0,
    })

    expect(body.data.total).toEqual({
      income: 800000,
      expense: 200000,
      saving: 100000,
      net: 600000,
    })

    const food = body.data.byCategory.find(
      (item: { name: string }) => item.name === "식비",
    )
    expect(food.amount).toBe(100000) // 6월 50,000 + 7월 50,000(롤업)
    expect(food.type).toBe("expense")
  })

  test("검증 실패 — year 누락은 400", async () => {
    const response = await getAnnual(
      new Request("http://localhost/api/v1/settlements/annual"),
    )
    expect(response.status).toBe(400)
  })
})
