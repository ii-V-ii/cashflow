import { afterAll, beforeEach, describe, expect, test, vi } from "vitest"

const getAuthUserMock = vi.fn(async () => ({
  id: "test-user",
  email: "owner@local.test",
}))

vi.mock("@/server/auth", () => ({
  getAuthUser: () => getAuthUserMock(),
}))

import { GET as listCategories, POST as postCategory } from "@/app/api/v1/categories/route"
import {
  DELETE as deleteCategory,
  PATCH as patchCategory,
} from "@/app/api/v1/categories/[id]/route"
import { PATCH as reorderCategories } from "@/app/api/v1/categories/order/route"
import { GET as listTags } from "@/app/api/v1/tags/route"
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
  return new Request("http://localhost/api/v1/categories", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const idParams = (id: string) => ({ params: Promise.resolve({ id }) })

async function createCategory(overrides: Record<string, unknown> = {}) {
  const response = await postCategory(
    jsonRequest("POST", {
      name: "식비",
      type: "expense",
      expenseKind: "consumption",
      ...overrides,
    }),
  )
  return { response, body: await response.json() }
}

describe("POST /api/v1/categories", () => {
  test("creates a top-level expense category", async () => {
    const { response, body } = await createCategory()
    expect(response.status).toBe(201)
    expect(body.data).toMatchObject({
      name: "식비",
      type: "expense",
      expenseKind: "consumption",
      parentId: null,
    })
  })

  test("creates a child category (2단계)", async () => {
    const { body: parent } = await createCategory()
    const { response, body } = await createCategory({
      name: "외식",
      parentId: parent.data.id,
    })
    expect(response.status).toBe(201)
    expect(body.data.parentId).toBe(parent.data.id)
  })

  test("rejects 3rd level with 422 MAX_DEPTH_EXCEEDED", async () => {
    const { body: parent } = await createCategory()
    const { body: child } = await createCategory({ name: "외식", parentId: parent.data.id })

    const { response, body } = await createCategory({
      name: "심야외식",
      parentId: child.data.id,
    })
    expect(response.status).toBe(422)
    expect(body.error.code).toBe("MAX_DEPTH_EXCEEDED")
  })

  test("unknown parent → 404", async () => {
    const { response } = await createCategory({
      parentId: "99999999-9999-4999-8999-999999999999",
    })
    expect(response.status).toBe(404)
  })

  test("expense without expenseKind → 400", async () => {
    const { response } = await createCategory({ expenseKind: undefined })
    expect(response.status).toBe(400)
  })

  test("unauthenticated → 401", async () => {
    getAuthUserMock.mockResolvedValue(null as never)
    const { response } = await createCategory()
    expect(response.status).toBe(401)
  })
})

describe("GET /api/v1/categories", () => {
  test("filters by type and returns flat list", async () => {
    await createCategory()
    await createCategory({ name: "급여", type: "income", expenseKind: undefined })

    const response = await listCategories(new Request("http://localhost/x?type=income"))
    const body = await response.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].name).toBe("급여")
  })

  test("grouped=true nests children under parents", async () => {
    const { body: parent } = await createCategory()
    await createCategory({ name: "외식", parentId: parent.data.id })

    const response = await listCategories(new Request("http://localhost/x?grouped=true"))
    const body = await response.json()

    expect(body.data).toHaveLength(1)
    expect(body.data[0].name).toBe("식비")
    expect(body.data[0].children).toHaveLength(1)
    expect(body.data[0].children[0].name).toBe("외식")
  })
})

describe("PATCH/DELETE /api/v1/categories/{id}", () => {
  test("renames a category preserving other fields", async () => {
    const { body: created } = await createCategory()
    const response = await patchCategory(
      jsonRequest("PATCH", { name: "먹거리" }),
      idParams(created.data.id),
    )
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.data.name).toBe("먹거리")
    expect(body.data.expenseKind).toBe("consumption")
  })

  test("delete succeeds when unreferenced, 404 when missing", async () => {
    const { body: created } = await createCategory()
    const response = await deleteCategory(jsonRequest("DELETE"), idParams(created.data.id))
    expect(response.status).toBe(200)

    const again = await deleteCategory(jsonRequest("DELETE"), idParams(created.data.id))
    expect(again.status).toBe(404)
  })

  test("delete referenced by transactions → 409 REFERENCE_EXISTS", async () => {
    const { body: created } = await createCategory()
    const accounts = await sql`
      INSERT INTO public.accounts (name, type) VALUES ('은행', 'bank') RETURNING id
    `
    await sql`
      INSERT INTO public.transactions (type, amount, description, account_id, category_id, date)
      VALUES ('expense', 1000, '지출', ${accounts[0].id}, ${created.data.id}, '2026-07-01')
    `

    const response = await deleteCategory(jsonRequest("DELETE"), idParams(created.data.id))
    expect(response.status).toBe(409)
    expect((await response.json()).error.code).toBe("REFERENCE_EXISTS")
  })
})

describe("PATCH /api/v1/categories/order", () => {
  test("reorders categories in batch", async () => {
    const { body: a } = await createCategory({ name: "A" })
    const { body: b } = await createCategory({ name: "B" })

    const response = await reorderCategories(
      jsonRequest("PATCH", {
        items: [
          { id: a.data.id, sortOrder: 1 },
          { id: b.data.id, sortOrder: 0 },
        ],
      }),
    )
    expect(response.status).toBe(200)
    expect((await response.json()).data).toEqual({ updated: 2 })

    const list = (await (await listCategories(new Request("http://localhost/x"))).json()).data
    expect(list.map((category: { name: string }) => category.name)).toEqual(["B", "A"])
  })

  test("unknown id in batch → 404, nothing is applied (SEC-M4: 부분 성공 금지)", async () => {
    const { body: a } = await createCategory({ name: "A" })

    const response = await reorderCategories(
      jsonRequest("PATCH", {
        items: [
          { id: a.data.id, sortOrder: 7 },
          { id: "99999999-9999-4999-8999-999999999999", sortOrder: 8 },
        ],
      }),
    )
    expect(response.status).toBe(404)
    expect((await response.json()).error.code).toBe("NOT_FOUND")

    const rows = await sql`SELECT sort_order FROM public.categories WHERE id = ${a.data.id}`
    expect(Number(rows[0].sort_order)).not.toBe(7)
  })
})

describe("GET /api/v1/tags", () => {
  beforeEach(async () => {
    await sql`INSERT INTO public.tags (name) VALUES ('외식'), ('회사'), ('회식')`
  })

  test("returns recent tags without q", async () => {
    const response = await listTags(new Request("http://localhost/api/v1/tags"))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.data).toHaveLength(3)
    expect(body.data[0]).toHaveProperty("id")
    expect(body.data[0]).toHaveProperty("name")
  })

  test("q filters by partial match, name order, max 20", async () => {
    const response = await listTags(new Request("http://localhost/api/v1/tags?q=회"))
    const body = await response.json()
    expect(body.data.map((tag: { name: string }) => tag.name)).toEqual(["회사", "회식"])
  })

  test("unauthenticated → 401", async () => {
    getAuthUserMock.mockResolvedValue(null as never)
    const response = await listTags(new Request("http://localhost/api/v1/tags"))
    expect(response.status).toBe(401)
  })
})
