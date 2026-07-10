import { afterAll, beforeEach, describe, expect, test, vi } from "vitest"

const getAuthUserMock = vi.fn(async () => ({
  id: "test-user",
  email: "owner@local.test",
}))

vi.mock("@/server/auth", () => ({
  getAuthUser: () => getAuthUserMock(),
}))

import { GET as listTransactions, POST as postTransaction } from "@/app/api/v1/transactions/route"
import {
  DELETE as deleteTransaction,
  GET as getTransaction,
  PATCH as patchTransaction,
} from "@/app/api/v1/transactions/[id]/route"
import { GET as listAccounts } from "@/app/api/v1/accounts/route"
import { closeDb } from "@/server/db/client"

import { createTestDb, truncateTransactionCore } from "./helpers/db"

/**
 * REST /api/v1/transactions 통합 테스트 (API.md §2) — 라우트 핸들러 직접 호출,
 * 로컬 Supabase(127.0.0.1:54322) 대상. envelope·에러 코드·검증 실패 포함.
 */
const sql = createTestDb()

afterAll(async () => {
  await sql.end()
  await closeDb()
})

let bankId: string
let savingsId: string
let foodCategoryId: string
let salaryCategoryId: string
let savingCategoryId: string

beforeEach(async () => {
  getAuthUserMock.mockResolvedValue({ id: "test-user", email: "owner@local.test" })
  await truncateTransactionCore(sql)

  const accounts = await sql`
    INSERT INTO public.accounts (name, type, initial_balance, sort_order) VALUES
      ('테스트은행', 'bank', 100000, 0),
      ('테스트카드', 'card', 0, 1),
      ('테스트적금', 'savings', 0, 2)
    RETURNING id
  `
  bankId = accounts[0].id
  savingsId = accounts[2].id

  const categories = await sql`
    INSERT INTO public.categories (name, type, expense_kind) VALUES
      ('식비', 'expense', 'consumption'),
      ('급여', 'income', NULL),
      ('저축', 'expense', 'saving')
    RETURNING id
  `
  foodCategoryId = categories[0].id
  salaryCategoryId = categories[1].id
  savingCategoryId = categories[2].id
})

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function postBody(overrides: Record<string, unknown> = {}) {
  return {
    type: "expense",
    amount: 12000,
    description: "점심",
    categoryId: foodCategoryId,
    accountId: bankId,
    date: "2026-07-10",
    ...overrides,
  }
}

async function createOne(overrides: Record<string, unknown> = {}) {
  const response = await postTransaction(
    jsonRequest("http://localhost/api/v1/transactions", "POST", postBody(overrides)),
  )
  const body = await response.json()
  return { response, body }
}

const idParams = (id: string) => ({ params: Promise.resolve({ id }) })

describe("POST /api/v1/transactions", () => {
  test("creates an expense and returns 201 with full Transaction DTO", async () => {
    const { response, body } = await createOne({ tags: ["외식", "회사"] })

    expect(response.status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(body.data.amount).toBe(12000)
    expect(body.data.category).toMatchObject({
      id: foodCategoryId,
      name: "식비",
      expenseKind: "consumption",
    })
    expect(body.data.account).toMatchObject({ id: bankId, name: "테스트은행", type: "bank" })
    expect(body.data.toAccount).toBeNull()
    expect(body.data.status).toBe("applied")
    expect(body.data.tags.map((t: { name: string }) => t.name).sort()).toEqual([
      "외식",
      "회사",
    ])
  })

  test("rejects invalid body with 400 VALIDATION_ERROR", async () => {
    const { response, body } = await createOne({ amount: -5 })
    expect(response.status).toBe(400)
    expect(body.error.code).toBe("VALIDATION_ERROR")
  })

  test("saving transaction without category → 422 SAVING_CATEGORY_REQUIRED", async () => {
    const { response, body } = await createOne({
      categoryId: null,
      toAccountId: savingsId,
    })
    expect(response.status).toBe(422)
    expect(body.error.code).toBe("SAVING_CATEGORY_REQUIRED")
  })

  test("unknown account id → 404 NOT_FOUND", async () => {
    const { response, body } = await createOne({
      accountId: "99999999-9999-4999-8999-999999999999",
    })
    expect(response.status).toBe(404)
    expect(body.error.code).toBe("NOT_FOUND")
  })

  test("unauthenticated → 401 UNAUTHORIZED envelope", async () => {
    getAuthUserMock.mockResolvedValue(null as never)
    const { response, body } = await createOne()
    expect(response.status).toBe(401)
    expect(body.error.code).toBe("UNAUTHORIZED")
  })

  test("saving category without toAccountId → 422 (RPC 검증)", async () => {
    const { response, body } = await createOne({ categoryId: savingCategoryId })
    expect(response.status).toBe(422)
    expect(body.error.code).toBe("SAVING_CATEGORY_REQUIRED")
  })

  test("consumption category with toAccountId → 422 (역방향 검증, DB-H1)", async () => {
    const { response, body } = await createOne({
      categoryId: foodCategoryId,
      toAccountId: savingsId,
    })
    expect(response.status).toBe(422)
    expect(body.error.code).toBe("SAVING_CATEGORY_REQUIRED")
  })

  test("saving transaction (expense + toAccountId + saving category) succeeds", async () => {
    const { response, body } = await createOne({
      categoryId: savingCategoryId,
      toAccountId: savingsId,
      description: "월 저축",
    })
    expect(response.status).toBe(201)
    expect(body.data.toAccount).toMatchObject({ id: savingsId })
  })

  test("transfer moves balance between accounts (view-derived)", async () => {
    await createOne({
      type: "transfer",
      amount: 30000,
      description: "적금 이체",
      categoryId: null,
      toAccountId: savingsId,
    })

    const accountsResponse = await listAccounts()
    const accounts = (await accountsResponse.json()).data
    const bank = accounts.find((a: { id: string }) => a.id === bankId)
    const savings = accounts.find((a: { id: string }) => a.id === savingsId)
    expect(bank.balance).toBe(70000)
    expect(savings.balance).toBe(30000)
  })
})

describe("GET /api/v1/transactions", () => {
  beforeEach(async () => {
    await createOne({ description: "점심 김밥", date: "2026-07-05", tags: ["외식"] })
    await createOne({
      type: "income",
      amount: 3000000,
      description: "7월 급여",
      categoryId: salaryCategoryId,
      date: "2026-07-25",
    })
    await createOne({ description: "6월 커피", date: "2026-06-30" })
  })

  test("returns paginated envelope sorted by date DESC", async () => {
    const response = await listTransactions(
      new Request("http://localhost/api/v1/transactions?page=1&limit=2"),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.total).toBe(3)
    expect(body.data.page).toBe(1)
    expect(body.data.limit).toBe(2)
    expect(body.data.items).toHaveLength(2)
    expect(body.data.items[0].description).toBe("7월 급여")
    expect(body.data.items[0].category).toMatchObject({ name: "급여" })
  })

  test("filters by type / date range / search / tags", async () => {
    const byType = await (
      await listTransactions(new Request("http://localhost/x?type=income"))
    ).json()
    expect(byType.data.total).toBe(1)

    const byRange = await (
      await listTransactions(
        new Request("http://localhost/x?from=2026-07-01&to=2026-07-31"),
      )
    ).json()
    expect(byRange.data.total).toBe(2)

    const bySearch = await (
      await listTransactions(new Request("http://localhost/x?search=김밥"))
    ).json()
    expect(bySearch.data.total).toBe(1)

    const byTags = await (
      await listTransactions(new Request("http://localhost/x?tags=외식,없는태그"))
    ).json()
    expect(byTags.data.total).toBe(1)
  })

  test("filters by accountId including transfer destination", async () => {
    await createOne({
      type: "transfer",
      amount: 1000,
      description: "이체",
      categoryId: null,
      toAccountId: savingsId,
      date: "2026-07-11",
    })
    const body = await (
      await listTransactions(
        new Request(`http://localhost/x?accountId=${savingsId}`),
      )
    ).json()
    expect(body.data.total).toBe(1)
    expect(body.data.items[0].description).toBe("이체")
  })

  test("rejects invalid query with 400", async () => {
    const response = await listTransactions(
      new Request("http://localhost/x?limit=999"),
    )
    expect(response.status).toBe(400)
  })
})

describe("GET/PATCH/DELETE /api/v1/transactions/{id}", () => {
  test("get returns single transaction, 404 when missing", async () => {
    const { body: created } = await createOne()
    const response = await getTransaction(
      new Request("http://localhost/x"),
      idParams(created.data.id),
    )
    expect(response.status).toBe(200)
    expect((await response.json()).data.id).toBe(created.data.id)

    const missing = await getTransaction(
      new Request("http://localhost/x"),
      idParams("99999999-9999-4999-8999-999999999999"),
    )
    expect(missing.status).toBe(404)
  })

  test("patch updates amount and replaces tags", async () => {
    const { body: created } = await createOne({ tags: ["외식"] })
    const response = await patchTransaction(
      jsonRequest("http://localhost/x", "PATCH", { amount: 9000, tags: ["회사"] }),
      idParams(created.data.id),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.amount).toBe(9000)
    expect(body.data.tags.map((t: { name: string }) => t.name)).toEqual(["회사"])
  })

  test("patch composing an invalid saving state → 422 (최종 상태 기준, DB-H1)", async () => {
    const { body: created } = await createOne({
      categoryId: savingCategoryId,
      toAccountId: savingsId,
      description: "월 저축",
    })

    // 소비 카테고리로 전환하는데 toAccountId 유지 → 역방향 위반
    const switched = await patchTransaction(
      jsonRequest("http://localhost/x", "PATCH", { categoryId: foodCategoryId }),
      idParams(created.data.id),
    )
    expect(switched.status).toBe(422)
    expect((await switched.json()).error.code).toBe("SAVING_CATEGORY_REQUIRED")

    // 저축 거래에서 입금 계좌 제거 → 순방향 위반
    const removed = await patchTransaction(
      jsonRequest("http://localhost/x", "PATCH", { toAccountId: null }),
      idParams(created.data.id),
    )
    expect(removed.status).toBe(422)
  })

  test("patch unknown id → 404", async () => {
    const response = await patchTransaction(
      jsonRequest("http://localhost/x", "PATCH", { amount: 1 }),
      idParams("99999999-9999-4999-8999-999999999999"),
    )
    expect(response.status).toBe(404)
  })

  test("delete removes row, restores balance, returns { id }", async () => {
    const { body: created } = await createOne({ amount: 40000 })

    const response = await deleteTransaction(
      new Request("http://localhost/x", { method: "DELETE" }),
      idParams(created.data.id),
    )
    expect(response.status).toBe(200)
    expect((await response.json()).data).toEqual({ id: created.data.id })

    const rows = await sql`SELECT id FROM public.transactions`
    expect(rows).toHaveLength(0)

    const accounts = (await (await listAccounts()).json()).data
    const bank = accounts.find((a: { id: string }) => a.id === bankId)
    expect(bank.balance).toBe(100000)
  })

  test("delete unknown id → 404", async () => {
    const response = await deleteTransaction(
      new Request("http://localhost/x", { method: "DELETE" }),
      idParams("99999999-9999-4999-8999-999999999999"),
    )
    expect(response.status).toBe(404)
  })
})
