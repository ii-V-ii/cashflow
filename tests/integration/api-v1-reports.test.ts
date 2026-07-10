import { afterAll, beforeEach, describe, expect, test, vi } from "vitest"

const getAuthUserMock = vi.fn(async () => ({
  id: "test-user",
  email: "owner@local.test",
}))

vi.mock("@/server/auth", () => ({
  getAuthUser: () => getAuthUserMock(),
}))

import { GET as getTrend } from "@/app/api/v1/reports/trend/route"
import { GET as getCategories } from "@/app/api/v1/reports/categories/route"
import { GET as getNetWorth } from "@/app/api/v1/reports/net-worth/route"
import { closeDb } from "@/server/db/client"

import { createTestDb, truncateTransactionCore } from "./helpers/db"

/**
 * REST /api/v1/reports 통합 테스트 (API.md §14) — 각 1왕복 집계.
 * 추이(빈 달 0 채움) / 카테고리 도넛(대분류 롤업) / 순자산(계좌 잔액 기준).
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
    INSERT INTO public.categories (name, type, expense_kind, color) VALUES
      ('식비', 'expense', 'consumption', '#f43f5e'),
      ('저축', 'expense', 'saving', NULL),
      ('급여', 'income', NULL, NULL)
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
      ('income',  300000, '5월급여', 'applied', ${salaryId}, ${bankId}, NULL, '2026-05-05'),
      ('income',  500000, '7월급여', 'applied', ${salaryId}, ${bankId}, NULL, '2026-07-01'),
      ('expense',  30000, '장보기', 'applied', ${foodId},   ${bankId}, NULL, '2026-07-03'),
      ('expense',  20000, '외식',   'applied', ${diningOutId}, ${bankId}, NULL, '2026-07-05'),
      ('expense', 100000, '적금',   'applied', ${savingId}, ${bankId}, ${savingsId}, '2026-07-10'),
      ('expense', 999999, '예정',   'pending', ${foodId},   ${bankId}, NULL, '2026-07-20')
  `
})

describe("GET /api/v1/reports/trend", () => {
  test("월별 추이를 돌려주고 빈 달은 0으로 채운다", async () => {
    const response = await getTrend(
      new Request("http://localhost/api/v1/reports/trend?from=2026-05&to=2026-07"),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.months).toEqual([
      { ym: "2026-05", income: 300000, expense: 0, saving: 0, net: 300000 },
      { ym: "2026-06", income: 0, expense: 0, saving: 0, net: 0 },
      { ym: "2026-07", income: 500000, expense: 150000, saving: 100000, net: 350000 },
    ])
  })

  test("from > to 는 400", async () => {
    const response = await getTrend(
      new Request("http://localhost/api/v1/reports/trend?from=2026-08&to=2026-07"),
    )
    expect(response.status).toBe(400)
  })

  test("from/to 미지정 시 기본 최근 12개월", async () => {
    const response = await getTrend(
      new Request("http://localhost/api/v1/reports/trend"),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.months).toHaveLength(12)
  })
})

describe("GET /api/v1/reports/categories", () => {
  test("대분류 롤업 지출 구성(색·구성비 포함)을 돌려준다", async () => {
    const response = await getCategories(
      new Request("http://localhost/api/v1/reports/categories?year=2026&month=7"),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.total).toBe(150000)

    const byCategory = body.data.byCategory
    expect(byCategory).toHaveLength(2)
    // 금액 내림차순 — 저축 100,000 먼저
    expect(byCategory[0].name).toBe("저축")
    expect(byCategory[0].ratio).toBeCloseTo(66.7, 1)

    const food = byCategory[1]
    expect(food.name).toBe("식비")
    expect(food.amount).toBe(50000) // 외식(소분류) 롤업 포함
    expect(food.color).toBe("#f43f5e")
    expect(food.categoryId).toBe(foodId)
  })

  test("거래 없는 달은 total 0 + 빈 배열", async () => {
    const response = await getCategories(
      new Request("http://localhost/api/v1/reports/categories?year=2025&month=1"),
    )
    const body = await response.json()

    expect(body.data.total).toBe(0)
    expect(body.data.byCategory).toEqual([])
  })
})

describe("GET /api/v1/reports/net-worth", () => {
  test("월말 포인트 시계열(계좌 잔액 기준)을 돌려준다", async () => {
    const response = await getNetWorth(
      new Request("http://localhost/api/v1/reports/net-worth?months=3"),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    const points = body.data.points
    expect(points).toHaveLength(3)

    // 마지막 포인트 = 현재 월말 — applied 전체 반영 잔액
    // 100,000(초기) + 300,000 + 500,000 - 150,000(저축 이체는 계좌 간 이동 → 합계 불변... 아님:
    // 저축 100,000은 은행→적금 내부 이동이므로 총잔액에는 -100,000 + +100,000 = 0)
    // 총잔액 = 100,000 + 300,000 + 500,000 - 50,000 = 850,000
    const last = points[points.length - 1]
    expect(last.accountTotal).toBe(850000)
    expect(last.assetTotal).toBe(0) // 자산 트랙 랜딩 전 placeholder
    expect(last.netWorth).toBe(850000)

    // 날짜는 오름차순 월말
    expect(points[0].date < last.date).toBe(true)
  })

  test("months 상한 초과는 400", async () => {
    const response = await getNetWorth(
      new Request("http://localhost/api/v1/reports/net-worth?months=61"),
    )
    expect(response.status).toBe(400)
  })
})
