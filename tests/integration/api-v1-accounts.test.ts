import { afterAll, beforeEach, describe, expect, test, vi } from "vitest"

const getAuthUserMock = vi.fn(async () => ({
  id: "test-user",
  email: "owner@local.test",
}))

vi.mock("@/server/auth", () => ({
  getAuthUser: () => getAuthUserMock(),
}))

import { GET as listAccounts, POST as postAccount } from "@/app/api/v1/accounts/route"
import {
  DELETE as deleteAccount,
  GET as getAccount,
  PATCH as patchAccount,
} from "@/app/api/v1/accounts/[id]/route"
import { PATCH as reorderAccounts } from "@/app/api/v1/accounts/order/route"
import { closeDb } from "@/server/db/client"

import { createTestDb, truncateTransactionCore } from "./helpers/db"

const sql = createTestDb()

afterAll(async () => {
  await sql.end()
  await closeDb()
})

beforeEach(async () => {
  getAuthUserMock.mockResolvedValue({ id: "test-user", email: "owner@local.test" })
  await truncateTransactionCore(sql)
})

function jsonRequest(method: string, body?: unknown): Request {
  return new Request("http://localhost/api/v1/accounts", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const idParams = (id: string) => ({ params: Promise.resolve({ id }) })

async function createAccount(overrides: Record<string, unknown> = {}) {
  const response = await postAccount(
    jsonRequest("POST", { name: "국민은행", type: "bank", balance: 50000, ...overrides }),
  )
  return { response, body: await response.json() }
}

describe("POST /api/v1/accounts", () => {
  test("creates account, balance mirrors initialBalance", async () => {
    const { response, body } = await createAccount()

    expect(response.status).toBe(201)
    expect(body.data).toMatchObject({
      name: "국민은행",
      type: "bank",
      balance: 50000,
      initialBalance: 50000,
    })
    expect(body.data.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  test("creates savings account with detail fields", async () => {
    const { response, body } = await createAccount({
      name: "청년적금",
      type: "savings",
      balance: 0,
      depositType: "installment",
      termMonths: 24,
      interestRate: 4.5,
      taxType: "tax_free",
      openDate: "2026-01-15",
      monthlyPayment: 200000,
    })

    expect(response.status).toBe(201)
    expect(body.data).toMatchObject({
      depositType: "installment",
      termMonths: 24,
      interestRate: 4.5,
      taxType: "tax_free",
      openDate: "2026-01-15",
      monthlyPayment: 200000,
    })
  })

  test("rejects invalid body with 400", async () => {
    const { response } = await createAccount({ name: "" })
    expect(response.status).toBe(400)
  })

  test("unauthenticated → 401", async () => {
    getAuthUserMock.mockResolvedValue(null as never)
    const { response } = await createAccount()
    expect(response.status).toBe(401)
  })
})

describe("GET /api/v1/accounts(+/{id})", () => {
  test("lists accounts in sortOrder with view-derived balance", async () => {
    const { body: first } = await createAccount({ name: "A은행" })
    await createAccount({ name: "B은행", balance: 10 })

    await sql`
      INSERT INTO public.transactions (type, amount, description, account_id, date)
      VALUES ('expense', 20000, '지출', ${first.data.id}, '2026-07-01')
    `

    const response = await listAccounts()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toHaveLength(2)
    expect(body.data[0].name).toBe("A은행")
    expect(body.data[0].balance).toBe(30000)
    expect(body.data[1].balance).toBe(10)
  })

  test("get single account / 404 when missing", async () => {
    const { body: created } = await createAccount()
    const response = await getAccount(jsonRequest("GET"), idParams(created.data.id))
    expect(response.status).toBe(200)
    expect((await response.json()).data.id).toBe(created.data.id)

    const missing = await getAccount(
      jsonRequest("GET"),
      idParams("99999999-9999-4999-8999-999999999999"),
    )
    expect(missing.status).toBe(404)
  })
})

describe("PATCH /api/v1/accounts/{id}", () => {
  test("updates name and initialBalance (balance recomputed)", async () => {
    const { body: created } = await createAccount()

    const response = await patchAccount(
      jsonRequest("PATCH", { name: "새이름", initialBalance: 99000 }),
      idParams(created.data.id),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.name).toBe("새이름")
    expect(body.data.initialBalance).toBe(99000)
    expect(body.data.balance).toBe(99000)
  })

  test("404 on unknown id", async () => {
    const response = await patchAccount(
      jsonRequest("PATCH", { name: "x" }),
      idParams("99999999-9999-4999-8999-999999999999"),
    )
    expect(response.status).toBe(404)
  })
})

describe("DELETE /api/v1/accounts/{id}", () => {
  test("deletes an unreferenced account", async () => {
    const { body: created } = await createAccount()
    const response = await deleteAccount(jsonRequest("DELETE"), idParams(created.data.id))
    expect(response.status).toBe(200)
    expect((await response.json()).data).toEqual({ id: created.data.id })
  })

  test("referenced account → 409 REFERENCE_EXISTS", async () => {
    const { body: created } = await createAccount()
    await sql`
      INSERT INTO public.transactions (type, amount, description, account_id, date)
      VALUES ('expense', 1000, '지출', ${created.data.id}, '2026-07-01')
    `

    const response = await deleteAccount(jsonRequest("DELETE"), idParams(created.data.id))
    expect(response.status).toBe(409)
    expect((await response.json()).error.code).toBe("REFERENCE_EXISTS")
  })

  test("404 on unknown id", async () => {
    const response = await deleteAccount(
      jsonRequest("DELETE"),
      idParams("99999999-9999-4999-8999-999999999999"),
    )
    expect(response.status).toBe(404)
  })
})

describe("PATCH /api/v1/accounts/order", () => {
  test("swaps sortOrder in a single batch", async () => {
    const { body: a } = await createAccount({ name: "A" })
    const { body: b } = await createAccount({ name: "B" })

    const response = await reorderAccounts(
      jsonRequest("PATCH", {
        items: [
          { id: a.data.id, sortOrder: 1 },
          { id: b.data.id, sortOrder: 0 },
        ],
      }),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toEqual({ updated: 2 })

    const list = (await (await listAccounts()).json()).data
    expect(list.map((account: { name: string }) => account.name)).toEqual(["B", "A"])
  })

  test("rejects empty items with 400", async () => {
    const response = await reorderAccounts(jsonRequest("PATCH", { items: [] }))
    expect(response.status).toBe(400)
  })
})
