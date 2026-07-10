import { afterAll, beforeEach, describe, expect, test, vi } from "vitest"

const getAuthUserMock = vi.fn(async () => ({
  id: "test-user",
  email: "owner@local.test",
}))

vi.mock("@/server/auth", () => ({
  getAuthUser: () => getAuthUserMock(),
}))

import {
  GET as listRecurring,
  POST as postRecurring,
} from "@/app/api/v1/recurring/route"
import {
  DELETE as deleteRecurring,
  GET as getRecurring,
  PATCH as patchRecurring,
} from "@/app/api/v1/recurring/[id]/route"
import { POST as processRecurring } from "@/app/api/v1/recurring/process/route"
import { GET as listTransactions } from "@/app/api/v1/transactions/route"
import { closeDb } from "@/server/db/client"

import { createTestDb, truncateTransactionCore } from "./helpers/db"

/**
 * REST /api/v1/recurring 통합 테스트 (API.md §12) — 라우트 핸들러 직접 호출,
 * 로컬 Supabase(127.0.0.1:54322) 대상. envelope·에러 코드·검증 실패 포함.
 */
const sql = createTestDb()

afterAll(async () => {
  await sql.end()
  await closeDb()
})

let bankId: string
let categoryId: string
let nextMonthFirst: string

beforeEach(async () => {
  getAuthUserMock.mockResolvedValue({ id: "test-user", email: "owner@local.test" })
  await truncateTransactionCore(sql)

  const accounts = await sql`
    INSERT INTO public.accounts (name, type, initial_balance, sort_order)
    VALUES ('REST은행', 'bank', 100000, 0)
    RETURNING id
  `
  bankId = accounts[0].id
  const categories = await sql`
    INSERT INTO public.categories (name, type, expense_kind)
    VALUES ('REST구독', 'expense', 'consumption')
    RETURNING id
  `
  categoryId = categories[0].id

  const rows = await sql`
    SELECT to_char(
      (date_trunc('month', (now() AT TIME ZONE 'Asia/Seoul')::date) + interval '1 month')::date,
      'YYYY-MM-DD') AS d
  `
  nextMonthFirst = rows[0].d as string
})

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function idContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

function postBody(overrides: Record<string, unknown> = {}) {
  return {
    type: "expense",
    amount: 15000,
    description: "OTT 구독",
    categoryId,
    accountId: bankId,
    frequency: "monthly",
    startDate: nextMonthFirst,
    ...overrides,
  }
}

async function createViaApi(
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const response = await postRecurring(
    jsonRequest("http://test/api/v1/recurring", "POST", postBody(overrides)),
  )
  expect(response.status).toBe(201)
  const body = await response.json()
  expect(body.success).toBe(true)
  return body.data as Record<string, unknown>
}

describe("POST /api/v1/recurring (§12.2)", () => {
  test("201 + Recurring DTO(camelCase)를 반환하고 interval 기본값 1을 적용한다", async () => {
    // Act
    const data = await createViaApi()

    // Assert
    expect(data).toMatchObject({
      type: "expense",
      amount: 15000,
      description: "OTT 구독",
      categoryId,
      accountId: bankId,
      toAccountId: null,
      frequency: "monthly",
      interval: 1,
      startDate: nextMonthFirst,
      endDate: null,
      nextDate: nextMonthFirst,
      isActive: true,
    })
    expect(data.id).toBeTruthy()
  })

  test("생성 직후 12개월 pending 거래가 존재하고 목록 API에서 '예정'(pending)으로 보인다", async () => {
    // Arrange
    const data = await createViaApi()

    // Act
    const response = await listTransactions(
      new Request("http://test/api/v1/transactions?page=1&limit=100"),
    )
    const body = await response.json()

    // Assert
    const items = body.data.items as Array<Record<string, unknown>>
    const pendings = items.filter((item) => item.recurringId === data.id)
    expect(pendings).toHaveLength(12)
    expect(pendings.every((item) => item.status === "pending")).toBe(true)
  })

  test("검증 실패는 400 VALIDATION_ERROR envelope", async () => {
    const response = await postRecurring(
      jsonRequest("http://test/api/v1/recurring", "POST", postBody({ amount: 0 })),
    )
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.success).toBe(false)
    expect(body.error.code).toBe("VALIDATION_ERROR")
  })

  test("이체에 입금 계좌가 없으면 400", async () => {
    const response = await postRecurring(
      jsonRequest(
        "http://test/api/v1/recurring",
        "POST",
        postBody({ type: "transfer", categoryId: undefined }),
      ),
    )
    expect(response.status).toBe(400)
  })

  test("없는 계좌를 참조하면 404 NOT_FOUND (FK 매핑)", async () => {
    const response = await postRecurring(
      jsonRequest(
        "http://test/api/v1/recurring",
        "POST",
        postBody({ accountId: "00000000-0000-4000-8000-000000000000" }),
      ),
    )
    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.error.code).toBe("NOT_FOUND")
  })

  test("미인증 요청은 401 UNAUTHORIZED", async () => {
    getAuthUserMock.mockResolvedValueOnce(null as never)
    const response = await postRecurring(
      jsonRequest("http://test/api/v1/recurring", "POST", postBody()),
    )
    expect(response.status).toBe(401)
  })
})

describe("GET /api/v1/recurring, GET /{id} (§12.1, §12.3)", () => {
  test("목록은 생성된 규칙을 포함한다", async () => {
    // Arrange
    const created = await createViaApi()

    // Act
    const response = await listRecurring()
    const body = await response.json()

    // Assert
    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    const items = body.data as Array<Record<string, unknown>>
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe(created.id)
  })

  test("단건 조회 200 / 없는 id는 404", async () => {
    const created = await createViaApi()

    const found = await getRecurring(
      new Request("http://test/api/v1/recurring/x"),
      idContext(created.id as string),
    )
    expect(found.status).toBe(200)

    const missing = await getRecurring(
      new Request("http://test/api/v1/recurring/x"),
      idContext("00000000-0000-4000-8000-000000000000"),
    )
    expect(missing.status).toBe(404)
    const body = await missing.json()
    expect(body.error.code).toBe("NOT_FOUND")
  })
})

describe("PATCH /api/v1/recurring/{id} (§12.4)", () => {
  test("부분 수정(amount) 후 갱신된 DTO를 반환한다", async () => {
    // Arrange
    const created = await createViaApi()

    // Act
    const response = await patchRecurring(
      jsonRequest("http://test/api/v1/recurring/x", "PATCH", { amount: 99000 }),
      idContext(created.id as string),
    )

    // Assert
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data.amount).toBe(99000)
  })

  test("isActive=false → 미래 pending 정리", async () => {
    // Arrange
    const created = await createViaApi()

    // Act
    const response = await patchRecurring(
      jsonRequest("http://test/api/v1/recurring/x", "PATCH", { isActive: false }),
      idContext(created.id as string),
    )

    // Assert
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data.isActive).toBe(false)
    const pendings = await sql`
      SELECT count(*)::int AS count FROM public.transactions WHERE status = 'pending'
    `
    expect(pendings[0].count).toBe(0)
  })

  test("없는 id는 404, 검증 실패는 400", async () => {
    const missing = await patchRecurring(
      jsonRequest("http://test/api/v1/recurring/x", "PATCH", { amount: 1 }),
      idContext("00000000-0000-4000-8000-000000000000"),
    )
    expect(missing.status).toBe(404)

    const created = await createViaApi()
    const invalid = await patchRecurring(
      jsonRequest("http://test/api/v1/recurring/x", "PATCH", { interval: 0 }),
      idContext(created.id as string),
    )
    expect(invalid.status).toBe(400)
  })
})

describe("DELETE /api/v1/recurring/{id} (§12.5)", () => {
  test("200 { id } 반환 + pending 정리, 없는 id는 404", async () => {
    // Arrange
    const created = await createViaApi()

    // Act
    const response = await deleteRecurring(
      new Request("http://test/api/v1/recurring/x", { method: "DELETE" }),
      idContext(created.id as string),
    )

    // Assert
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data).toEqual({ id: created.id })

    const again = await deleteRecurring(
      new Request("http://test/api/v1/recurring/x", { method: "DELETE" }),
      idContext(created.id as string),
    )
    expect(again.status).toBe(404)
  })
})

describe("POST /api/v1/recurring/process (§12.6)", () => {
  test("도래분이 없으면 processed 0 + generatedThrough 반환 (멱등)", async () => {
    // Arrange — 미래 시작 규칙만 존재
    await createViaApi()

    // Act
    const response = await processRecurring()
    const body = await response.json()

    // Assert
    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.processed).toBe(0)
    expect(body.data.generatedThrough).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test("오늘 시작 규칙은 processed ≥ 1로 applied 전환된다", async () => {
    // Arrange
    const todayRows = await sql`
      SELECT to_char((now() AT TIME ZONE 'Asia/Seoul')::date, 'YYYY-MM-DD') AS d
    `
    await createViaApi({ startDate: todayRows[0].d })

    // Act
    const response = await processRecurring()
    const body = await response.json()

    // Assert
    expect(body.data.processed).toBe(1)
    const applied = await sql`
      SELECT count(*)::int AS count FROM public.transactions WHERE status = 'applied'
    `
    expect(applied[0].count).toBe(1)
  })
})
