import { afterAll, beforeEach, describe, expect, test, vi } from "vitest"

const getAuthUserMock = vi.fn(async () => ({
  id: "test-user",
  email: "owner@local.test",
}))

vi.mock("@/server/auth", () => ({
  getAuthUser: () => getAuthUserMock(),
}))

import {
  GET as listBudgets,
  POST as postBudget,
} from "@/app/api/v1/budgets/route"
import {
  DELETE as deleteBudget,
  GET as getBudget,
  PATCH as patchBudget,
} from "@/app/api/v1/budgets/[id]/route"
import { POST as copyBudget } from "@/app/api/v1/budgets/copy/route"
import { GET as getActuals } from "@/app/api/v1/budgets/actuals/route"
import { GET as getAnnualGrid } from "@/app/api/v1/budgets/annual-grid/route"
import { PUT as putGridCell } from "@/app/api/v1/budgets/annual-grid/cell/route"
import { GET as getSummary } from "@/app/api/v1/budgets/summary/route"
import { closeDb } from "@/server/db/client"

import {
  createTestDb,
  truncateBudgets,
  truncateTransactionCore,
} from "./helpers/db"

const sql = createTestDb()

afterAll(async () => {
  await sql.end()
  await closeDb()
})

/** 시드 카테고리/계좌 id 모음 — 각 테스트가 필요한 것만 사용 */
interface Seed {
  accountId: string
  savingsAccountId: string
  food: string // 식비 (대분류 expense/consumption)
  dining: string // 외식 (식비의 소분류)
  transport: string // 교통 (대분류 expense/consumption, 예산 미편성용)
  saving: string // 저축 (대분류 expense/saving)
  salary: string // 급여 (income)
}

async function seedBase(): Promise<Seed> {
  const accounts = await sql`
    INSERT INTO public.accounts (name, type, initial_balance, sort_order) VALUES
      ('테스트은행', 'bank', 1000000, 0),
      ('테스트적금', 'savings', 0, 1)
    RETURNING id, name
  `
  const categories = await sql`
    INSERT INTO public.categories (name, type, expense_kind, sort_order) VALUES
      ('식비', 'expense', 'consumption', 0),
      ('교통', 'expense', 'consumption', 1),
      ('저축', 'expense', 'saving', 2),
      ('급여', 'income', NULL, 0)
    RETURNING id, name
  `
  const byName = (rows: { id: string; name: string }[], name: string) => {
    const row = rows.find((r) => r.name === name)
    if (!row) throw new Error(`seed row not found: ${name}`)
    return row.id
  }
  const food = byName(categories as never, "식비")
  const dining = await sql`
    INSERT INTO public.categories (name, type, expense_kind, parent_id, sort_order)
    VALUES ('외식', 'expense', 'consumption', ${food}, 0)
    RETURNING id
  `
  return {
    accountId: byName(accounts as never, "테스트은행"),
    savingsAccountId: byName(accounts as never, "테스트적금"),
    food,
    dining: dining[0].id as string,
    transport: byName(categories as never, "교통"),
    saving: byName(categories as never, "저축"),
    salary: byName(categories as never, "급여"),
  }
}

interface TxSeed {
  type: "income" | "expense" | "transfer"
  amount: number
  date: string
  accountId: string
  categoryId?: string | null
  toAccountId?: string | null
  status?: "applied" | "pending"
}

async function seedTx(tx: TxSeed): Promise<void> {
  await sql`
    INSERT INTO public.transactions
      (type, amount, description, status, category_id, account_id, to_account_id, date)
    VALUES
      (${tx.type}, ${tx.amount}, ${"통합테스트 거래"}, ${tx.status ?? "applied"},
       ${tx.categoryId ?? null}, ${tx.accountId}, ${tx.toAccountId ?? null}, ${tx.date})
  `
}

function request(path: string, method = "GET", body?: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const idParams = (id: string) => ({ params: Promise.resolve({ id }) })

async function createBudget(body: Record<string, unknown>) {
  const response = await postBudget(request("/api/v1/budgets", "POST", body))
  return { response, body: await response.json() }
}

let seed: Seed

beforeEach(async () => {
  getAuthUserMock.mockResolvedValue({ id: "test-user", email: "owner@local.test" })
  await truncateBudgets(sql)
  await truncateTransactionCore(sql)
  seed = await seedBase()
})

describe("POST /api/v1/budgets", () => {
  test("creates budget with items and returns 201 Budget", async () => {
    const { response, body } = await createBudget({
      name: "2026년 3월 예산",
      year: 2026,
      month: 3,
      items: [
        { categoryId: seed.food, plannedAmount: 300000 },
        { categoryId: seed.salary, plannedAmount: 5000000, memo: "월급" },
      ],
    })

    expect(response.status).toBe(201)
    expect(body.data).toMatchObject({ name: "2026년 3월 예산", year: 2026, month: 3 })
    expect(body.data.items).toHaveLength(2)
    const salaryItem = body.data.items.find(
      (item: { categoryId: string }) => item.categoryId === seed.salary,
    )
    expect(salaryItem).toMatchObject({
      plannedAmount: 5000000,
      memo: "월급",
      category: { name: "급여", type: "income" },
    })
  })

  test("rejects duplicate year+month with 409 DUPLICATE_BUDGET", async () => {
    await createBudget({ name: "3월", year: 2026, month: 3 })
    const { response, body } = await createBudget({ name: "3월 중복", year: 2026, month: 3 })

    expect(response.status).toBe(409)
    expect(body.error.code).toBe("DUPLICATE_BUDGET")
  })

  test("annual budget (month null) is also unique per year", async () => {
    const first = await createBudget({ name: "2026 연간", year: 2026, month: null })
    expect(first.response.status).toBe(201)
    expect(first.body.data.month).toBeNull()

    const dup = await createBudget({ name: "2026 연간 중복", year: 2026 })
    expect(dup.response.status).toBe(409)
    expect(dup.body.error.code).toBe("DUPLICATE_BUDGET")
  })

  test("rejects unknown categoryId with 404 (FK)", async () => {
    const { response } = await createBudget({
      name: "3월",
      year: 2026,
      month: 3,
      items: [{ categoryId: "00000000-0000-4000-8000-000000000000", plannedAmount: 1000 }],
    })
    expect(response.status).toBe(404)
  })

  test("rejects invalid body with 400 VALIDATION_ERROR", async () => {
    const { response, body } = await createBudget({ year: 2026, month: 3 })
    expect(response.status).toBe(400)
    expect(body.error.code).toBe("VALIDATION_ERROR")
  })
})

describe("GET /api/v1/budgets", () => {
  test("lists budgets for a year with itemCount and expense plannedTotal", async () => {
    await createBudget({
      name: "3월",
      year: 2026,
      month: 3,
      items: [
        { categoryId: seed.food, plannedAmount: 300000 },
        { categoryId: seed.saving, plannedAmount: 500000 },
        { categoryId: seed.salary, plannedAmount: 5000000 },
      ],
    })
    await createBudget({ name: "다른 해", year: 2025, month: 3 })

    const response = await listBudgets(request("/api/v1/budgets?year=2026"))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toHaveLength(1)
    // plannedTotal = 지출 계획 합 (수입 제외 — budget_totals_v.total_expense)
    expect(body.data[0]).toMatchObject({
      name: "3월",
      year: 2026,
      month: 3,
      itemCount: 3,
      plannedTotal: 800000,
    })
  })

  test("parent item with child items is excluded from plannedTotal (중복 방지)", async () => {
    await createBudget({
      name: "5월",
      year: 2026,
      month: 5,
      items: [
        { categoryId: seed.food, plannedAmount: 100000 }, // 대분류 — 소분류 존재 시 합계 제외
        { categoryId: seed.dining, plannedAmount: 60000 },
      ],
    })

    const response = await listBudgets(request("/api/v1/budgets?year=2026"))
    const body = await response.json()
    expect(body.data[0].plannedTotal).toBe(60000)
  })

  test("requires year query (400)", async () => {
    const response = await listBudgets(request("/api/v1/budgets"))
    expect(response.status).toBe(400)
  })
})

describe("GET /api/v1/budgets/{id}", () => {
  test("returns detail with per-item actuals (applied only, 저축 포함)", async () => {
    const { body: created } = await createBudget({
      name: "3월",
      year: 2026,
      month: 3,
      items: [
        { categoryId: seed.food, plannedAmount: 300000 },
        { categoryId: seed.saving, plannedAmount: 500000 },
        { categoryId: seed.salary, plannedAmount: 5000000 },
      ],
    })

    // 식비 실적: 직접 50,000 + 소분류(외식) 30,000 롤업, pending 20,000 제외
    await seedTx({ type: "expense", amount: 50000, date: "2026-03-05", accountId: seed.accountId, categoryId: seed.food })
    await seedTx({ type: "expense", amount: 30000, date: "2026-03-10", accountId: seed.accountId, categoryId: seed.dining })
    await seedTx({ type: "expense", amount: 20000, date: "2026-03-15", accountId: seed.accountId, categoryId: seed.food, status: "pending" })
    // 저축 거래(expense+saving+입금 계좌)도 지출 실적에 포함
    await seedTx({ type: "expense", amount: 200000, date: "2026-03-25", accountId: seed.accountId, categoryId: seed.saving, toAccountId: seed.savingsAccountId })
    await seedTx({ type: "income", amount: 4000000, date: "2026-03-25", accountId: seed.accountId, categoryId: seed.salary })
    // 이체는 예산 실적에서 제외
    await seedTx({ type: "transfer", amount: 100000, date: "2026-03-26", accountId: seed.accountId, toAccountId: seed.savingsAccountId })

    const response = await getBudget(
      request(`/api/v1/budgets/${created.data.id}`),
      idParams(created.data.id),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    const actualByCategory = Object.fromEntries(
      body.data.items.map((item: { categoryId: string; actualAmount: number }) => [
        item.categoryId,
        item.actualAmount,
      ]),
    )
    expect(actualByCategory[seed.food]).toBe(80000)
    expect(actualByCategory[seed.saving]).toBe(200000)
    expect(actualByCategory[seed.salary]).toBe(4000000)
    expect(body.data.plannedTotal).toBe(800000)
    expect(body.data.actualTotal).toBe(280000)
  })

  test("404 for unknown id", async () => {
    const response = await getBudget(
      request("/api/v1/budgets/00000000-0000-4000-8000-000000000000"),
      idParams("00000000-0000-4000-8000-000000000000"),
    )
    expect(response.status).toBe(404)
  })
})

describe("PATCH /api/v1/budgets/{id}", () => {
  test("updates name/memo without touching items", async () => {
    const { body: created } = await createBudget({
      name: "3월",
      year: 2026,
      month: 3,
      items: [{ categoryId: seed.food, plannedAmount: 300000 }],
    })

    const response = await patchBudget(
      request(`/api/v1/budgets/${created.data.id}`, "PATCH", { name: "3월 수정", memo: "메모" }),
      idParams(created.data.id),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toMatchObject({ name: "3월 수정", memo: "메모" })
    expect(body.data.items).toHaveLength(1)
  })

  test("items 전달 시 전량 교체", async () => {
    const { body: created } = await createBudget({
      name: "3월",
      year: 2026,
      month: 3,
      items: [{ categoryId: seed.food, plannedAmount: 300000 }],
    })

    const response = await patchBudget(
      request(`/api/v1/budgets/${created.data.id}`, "PATCH", {
        items: [{ categoryId: seed.transport, plannedAmount: 90000 }],
      }),
      idParams(created.data.id),
    )
    const body = await response.json()

    expect(body.data.items).toHaveLength(1)
    expect(body.data.items[0]).toMatchObject({
      categoryId: seed.transport,
      plannedAmount: 90000,
    })
  })

  test("404 for unknown id", async () => {
    const response = await patchBudget(
      request("/api/v1/budgets/00000000-0000-4000-8000-000000000000", "PATCH", { name: "x" }),
      idParams("00000000-0000-4000-8000-000000000000"),
    )
    expect(response.status).toBe(404)
  })
})

describe("DELETE /api/v1/budgets/{id}", () => {
  test("deletes budget and cascades items", async () => {
    const { body: created } = await createBudget({
      name: "3월",
      year: 2026,
      month: 3,
      items: [{ categoryId: seed.food, plannedAmount: 300000 }],
    })

    const response = await deleteBudget(
      request(`/api/v1/budgets/${created.data.id}`, "DELETE"),
      idParams(created.data.id),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toEqual({ id: created.data.id })
    const items = await sql`SELECT count(*)::int AS count FROM public.budget_items`
    expect(items[0].count).toBe(0)
  })

  test("404 for unknown id", async () => {
    const response = await deleteBudget(
      request("/api/v1/budgets/00000000-0000-4000-8000-000000000000", "DELETE"),
      idParams("00000000-0000-4000-8000-000000000000"),
    )
    expect(response.status).toBe(404)
  })
})

describe("POST /api/v1/budgets/copy", () => {
  test("copies source month budget items to target month", async () => {
    await createBudget({
      name: "3월",
      year: 2026,
      month: 3,
      items: [
        { categoryId: seed.food, plannedAmount: 300000, memo: "식비 메모" },
        { categoryId: seed.salary, plannedAmount: 5000000 },
      ],
    })

    const response = await copyBudget(
      request("/api/v1/budgets/copy", "POST", {
        sourceYear: 2026,
        sourceMonth: 3,
        targetYear: 2026,
        targetMonth: 4,
      }),
    )
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.data).toMatchObject({ year: 2026, month: 4 })
    expect(body.data.items).toHaveLength(2)
    const foodItem = body.data.items.find(
      (item: { categoryId: string }) => item.categoryId === seed.food,
    )
    expect(foodItem).toMatchObject({ plannedAmount: 300000, memo: "식비 메모" })
  })

  test("404 when source does not exist", async () => {
    const response = await copyBudget(
      request("/api/v1/budgets/copy", "POST", {
        sourceYear: 2026,
        sourceMonth: 1,
        targetYear: 2026,
        targetMonth: 2,
      }),
    )
    expect(response.status).toBe(404)
  })

  test("409 when target already exists", async () => {
    await createBudget({ name: "3월", year: 2026, month: 3 })
    await createBudget({ name: "4월", year: 2026, month: 4 })

    const response = await copyBudget(
      request("/api/v1/budgets/copy", "POST", {
        sourceYear: 2026,
        sourceMonth: 3,
        targetYear: 2026,
        targetMonth: 4,
      }),
    )
    const body = await response.json()
    expect(response.status).toBe(409)
    expect(body.error.code).toBe("DUPLICATE_BUDGET")
  })
})

describe("GET /api/v1/budgets/actuals — 도메인 규칙", () => {
  test("대분류 롤업·applied만·저축 포함·가상 항목", async () => {
    const { body: created } = await createBudget({
      name: "3월",
      year: 2026,
      month: 3,
      items: [
        { categoryId: seed.food, plannedAmount: 300000 },
        { categoryId: seed.saving, plannedAmount: 500000 },
        { categoryId: seed.salary, plannedAmount: 5000000 },
      ],
    })

    await seedTx({ type: "expense", amount: 50000, date: "2026-03-05", accountId: seed.accountId, categoryId: seed.food })
    // 소분류 실적은 부모 예산 항목으로 롤업
    await seedTx({ type: "expense", amount: 30000, date: "2026-03-10", accountId: seed.accountId, categoryId: seed.dining })
    // pending 제외
    await seedTx({ type: "expense", amount: 20000, date: "2026-03-15", accountId: seed.accountId, categoryId: seed.food, status: "pending" })
    // 저축 포함
    await seedTx({ type: "expense", amount: 200000, date: "2026-03-25", accountId: seed.accountId, categoryId: seed.saving, toAccountId: seed.savingsAccountId })
    await seedTx({ type: "income", amount: 4000000, date: "2026-03-25", accountId: seed.accountId, categoryId: seed.salary })
    // 예산 없는 실적 → planned 0 가상 항목
    await seedTx({ type: "expense", amount: 12000, date: "2026-03-08", accountId: seed.accountId, categoryId: seed.transport })
    // 미분류(카테고리 없음) 실적도 가상 항목
    await seedTx({ type: "expense", amount: 15000, date: "2026-03-09", accountId: seed.accountId, categoryId: null })
    // transfer는 제외
    await seedTx({ type: "transfer", amount: 999999, date: "2026-03-26", accountId: seed.accountId, toAccountId: seed.savingsAccountId })
    // 월 범위 밖 제외
    await seedTx({ type: "expense", amount: 77777, date: "2026-04-01", accountId: seed.accountId, categoryId: seed.food })

    const response = await getActuals(request("/api/v1/budgets/actuals?year=2026&month=3"))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.budgetId).toBe(created.data.id)

    const byCategory = Object.fromEntries(
      body.data.categories.map((row: { categoryId: string | null }) => [
        row.categoryId ?? "uncategorized",
        row,
      ]),
    )
    expect(byCategory[seed.food]).toMatchObject({ planned: 300000, actual: 80000 })
    expect(byCategory[seed.saving]).toMatchObject({ planned: 500000, actual: 200000 })
    expect(byCategory[seed.salary]).toMatchObject({ planned: 5000000, actual: 4000000 })
    expect(byCategory[seed.transport]).toMatchObject({
      planned: 0,
      actual: 12000,
      ratio: null,
    })
    expect(byCategory.uncategorized).toMatchObject({ planned: 0, actual: 15000 })
    // 소분류(외식)는 부모로 롤업되어 별도 행이 없다
    expect(byCategory[seed.dining]).toBeUndefined()

    // ratio = actual / planned * 100
    expect(byCategory[seed.food].ratio).toBeCloseTo(26.7, 1)

    // 총계는 지출 기준 (저축 포함, 수입 제외)
    expect(body.data.plannedTotal).toBe(800000)
    expect(body.data.actualTotal).toBe(307000)
  })

  test("소분류 예산 항목이 있으면 실적은 소분류에 붙고 부모 롤업 항목은 만들지 않는다", async () => {
    await createBudget({
      name: "4월",
      year: 2026,
      month: 4,
      items: [{ categoryId: seed.dining, plannedAmount: 100000 }],
    })

    await seedTx({ type: "expense", amount: 40000, date: "2026-04-05", accountId: seed.accountId, categoryId: seed.dining })
    // 부모(식비) 직접 실적은 부모 가상 항목으로만 — 소분류 실적을 이중 계상하지 않는다
    await seedTx({ type: "expense", amount: 10000, date: "2026-04-06", accountId: seed.accountId, categoryId: seed.food })

    const response = await getActuals(request("/api/v1/budgets/actuals?year=2026&month=4"))
    const body = await response.json()

    const byCategory = Object.fromEntries(
      body.data.categories.map((row: { categoryId: string | null }) => [row.categoryId, row]),
    )
    expect(byCategory[seed.dining]).toMatchObject({ planned: 100000, actual: 40000 })
    expect(byCategory[seed.food]).toMatchObject({ planned: 0, actual: 10000 })
    expect(body.data.actualTotal).toBe(50000)
  })

  test("예산이 없는 달도 실적 가상 항목만으로 응답한다", async () => {
    await seedTx({ type: "expense", amount: 30000, date: "2026-06-05", accountId: seed.accountId, categoryId: seed.food })

    const response = await getActuals(request("/api/v1/budgets/actuals?year=2026&month=6"))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.budgetId).toBeNull()
    expect(body.data.categories).toHaveLength(1)
    expect(body.data.categories[0]).toMatchObject({
      categoryId: seed.food,
      planned: 0,
      actual: 30000,
    })
    expect(body.data.plannedTotal).toBe(0)
  })
})

describe("GET /api/v1/budgets/annual-grid", () => {
  test("12개월 × 대분류 그룹 — 소분류가 있는 달은 소분류만 합산", async () => {
    await createBudget({
      name: "3월",
      year: 2026,
      month: 3,
      items: [{ categoryId: seed.food, plannedAmount: 300000 }],
    })
    await createBudget({
      name: "5월",
      year: 2026,
      month: 5,
      items: [
        { categoryId: seed.food, plannedAmount: 100000 }, // 소분류 존재 → 무시
        { categoryId: seed.dining, plannedAmount: 60000 },
      ],
    })
    // 연간 예산(month null)은 그리드에서 제외
    await createBudget({
      name: "연간",
      year: 2026,
      month: null,
      items: [{ categoryId: seed.food, plannedAmount: 9999999 }],
    })

    const response = await getAnnualGrid(
      request("/api/v1/budgets/annual-grid?year=2026&type=expense"),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.rows).toHaveLength(1)
    const foodRow = body.data.rows[0]
    expect(foodRow).toMatchObject({ categoryId: seed.food, categoryName: "식비" })
    expect(foodRow.months).toHaveLength(12)
    expect(foodRow.months[2]).toBe(300000) // 3월
    expect(foodRow.months[4]).toBe(60000) // 5월 — 소분류만
    expect(foodRow.total).toBe(360000)
    expect(body.data.monthTotals[2]).toBe(300000)
    expect(body.data.grandTotal).toBe(360000)
  })

  test("expenseKind 필터 (saving만)", async () => {
    await createBudget({
      name: "3월",
      year: 2026,
      month: 3,
      items: [
        { categoryId: seed.food, plannedAmount: 300000 },
        { categoryId: seed.saving, plannedAmount: 500000 },
      ],
    })

    const response = await getAnnualGrid(
      request("/api/v1/budgets/annual-grid?year=2026&expenseKind=saving"),
    )
    const body = await response.json()

    expect(body.data.rows).toHaveLength(1)
    expect(body.data.rows[0].categoryId).toBe(seed.saving)
    expect(body.data.grandTotal).toBe(500000)
  })
})

describe("PUT /api/v1/budgets/annual-grid/cell", () => {
  test("예산·항목이 없으면 생성(upsert), 재호출 시 금액 갱신", async () => {
    const first = await putGridCell(
      request("/api/v1/budgets/annual-grid/cell", "PUT", {
        year: 2026,
        month: 7,
        categoryId: seed.food,
        amount: 150000,
      }),
    )
    const firstBody = await first.json()

    expect(first.status).toBe(200)
    expect(firstBody.data.budgetId).toBeTruthy()
    expect(firstBody.data.itemId).toBeTruthy()
    expect(firstBody.data.amount).toBe(150000)

    const second = await putGridCell(
      request("/api/v1/budgets/annual-grid/cell", "PUT", {
        year: 2026,
        month: 7,
        categoryId: seed.food,
        amount: 90000,
      }),
    )
    const secondBody = await second.json()

    expect(secondBody.data.budgetId).toBe(firstBody.data.budgetId)
    expect(secondBody.data.itemId).toBe(firstBody.data.itemId)
    expect(secondBody.data.amount).toBe(90000)

    const budgets = await sql`SELECT count(*)::int AS count FROM public.budgets`
    expect(budgets[0].count).toBe(1)
  })

  test("amount 0 은 항목 삭제", async () => {
    await putGridCell(
      request("/api/v1/budgets/annual-grid/cell", "PUT", {
        year: 2026,
        month: 7,
        categoryId: seed.food,
        amount: 150000,
      }),
    )
    const response = await putGridCell(
      request("/api/v1/budgets/annual-grid/cell", "PUT", {
        year: 2026,
        month: 7,
        categoryId: seed.food,
        amount: 0,
      }),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.itemId).toBeNull()
    expect(body.data.amount).toBe(0)
    const items = await sql`SELECT count(*)::int AS count FROM public.budget_items`
    expect(items[0].count).toBe(0)
  })
})

describe("GET /api/v1/budgets/summary", () => {
  test("연간 12개월 계획·실적 요약", async () => {
    await createBudget({
      name: "3월",
      year: 2026,
      month: 3,
      items: [
        { categoryId: seed.food, plannedAmount: 300000 },
        { categoryId: seed.saving, plannedAmount: 500000 },
        { categoryId: seed.salary, plannedAmount: 5000000 },
      ],
    })
    await seedTx({ type: "expense", amount: 50000, date: "2026-03-05", accountId: seed.accountId, categoryId: seed.food })
    await seedTx({ type: "income", amount: 4000000, date: "2026-03-25", accountId: seed.accountId, categoryId: seed.salary })
    await seedTx({ type: "expense", amount: 11111, date: "2026-03-15", accountId: seed.accountId, categoryId: seed.food, status: "pending" })

    const response = await getSummary(request("/api/v1/budgets/summary?year=2026"))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.months).toHaveLength(12)
    expect(body.data.months[2]).toEqual({
      month: 3,
      plannedIncome: 5000000,
      plannedExpense: 800000,
      actualIncome: 4000000,
      actualExpense: 50000,
    })
    expect(body.data.months[0]).toEqual({
      month: 1,
      plannedIncome: 0,
      plannedExpense: 0,
      actualIncome: 0,
      actualExpense: 0,
    })
    expect(response.headers.get("cache-control")).toBeTruthy()
  })
})
