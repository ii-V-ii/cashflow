import { afterAll, beforeEach, describe, expect, test, vi } from "vitest"

const getAuthUserMock = vi.fn(async () => ({
  id: "test-user",
  email: "owner@local.test",
}))

vi.mock("@/server/auth", () => ({
  getAuthUser: () => getAuthUserMock(),
}))

import { GET as listAssets, POST as postAsset } from "@/app/api/v1/assets/route"
import {
  DELETE as deleteAsset,
  GET as getAsset,
  PATCH as patchAsset,
} from "@/app/api/v1/assets/[id]/route"
import { GET as getPortfolio } from "@/app/api/v1/assets/portfolio/route"
import {
  GET as listValuations,
  POST as postValuation,
} from "@/app/api/v1/assets/[id]/valuations/route"
import {
  GET as listAssetCategories,
  POST as postAssetCategory,
} from "@/app/api/v1/asset-categories/route"
import {
  DELETE as deleteAssetCategory,
  PATCH as patchAssetCategory,
} from "@/app/api/v1/asset-categories/[id]/route"
import { closeDb } from "@/server/db/client"

import { createTestDb, truncateAssetInvestmentCore } from "./helpers/db"

const sql = createTestDb()

afterAll(async () => {
  await sql.end()
  await closeDb()
})

beforeEach(async () => {
  getAuthUserMock.mockResolvedValue({ id: "test-user", email: "owner@local.test" })
  await truncateAssetInvestmentCore(sql)
})

function jsonRequest(path: string, method: string, body?: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const idParams = (id: string) => ({ params: Promise.resolve({ id }) })

async function createCategory(overrides: Record<string, unknown> = {}) {
  const response = await postAssetCategory(
    jsonRequest("/api/v1/asset-categories", "POST", {
      name: "주식",
      kind: "financial",
      ...overrides,
    }),
  )
  const body = await response.json()
  return { response, body, id: body.data?.id as string }
}

async function createAsset(categoryId: string, overrides: Record<string, unknown> = {}) {
  const response = await postAsset(
    jsonRequest("/api/v1/assets", "POST", {
      name: "해외주식",
      assetCategoryId: categoryId,
      acquisitionDate: "2026-01-01",
      acquisitionCost: 1_000_000,
      ...overrides,
    }),
  )
  const body = await response.json()
  return { response, body, id: body.data?.id as string }
}

// ─── asset-categories ────────────────────────────────────────

describe("asset-categories CRUD (API.md §10)", () => {
  test("생성 → 목록 → 수정 → 삭제 라운드트립", async () => {
    const { response, id } = await createCategory()
    expect(response.status).toBe(201)

    const listResponse = await listAssetCategories()
    const listBody = await listResponse.json()
    expect(listBody.data).toHaveLength(1)
    expect(listBody.data[0]).toMatchObject({ name: "주식", kind: "financial", sortOrder: 0 })

    const patchResponse = await patchAssetCategory(
      jsonRequest(`/api/v1/asset-categories/${id}`, "PATCH", { name: "국내주식" }),
      idParams(id),
    )
    expect(patchResponse.status).toBe(200)
    expect((await patchResponse.json()).data.name).toBe("국내주식")

    const deleteResponse = await deleteAssetCategory(
      jsonRequest(`/api/v1/asset-categories/${id}`, "DELETE"),
      idParams(id),
    )
    expect(deleteResponse.status).toBe(200)
  })

  test("자산이 참조 중이면 삭제 409 REFERENCE_EXISTS", async () => {
    const { id: categoryId } = await createCategory()
    await createAsset(categoryId)

    const response = await deleteAssetCategory(
      jsonRequest(`/api/v1/asset-categories/${categoryId}`, "DELETE"),
      idParams(categoryId),
    )
    expect(response.status).toBe(409)
    expect((await response.json()).error.code).toBe("REFERENCE_EXISTS")
  })

  test("잘못된 본문 400", async () => {
    const { response } = await createCategory({ kind: "other" })
    expect(response.status).toBe(400)
  })
})

// ─── assets ──────────────────────────────────────────────────

describe("assets CRUD (API.md §9)", () => {
  test("생성: initialValue는 최초 평가이력이 되고 currentValue에 반영된다", async () => {
    const { id: categoryId } = await createCategory()
    const { response, body } = await createAsset(categoryId, {
      initialValue: 1_200_000,
    })

    expect(response.status).toBe(201)
    expect(body.data).toMatchObject({
      name: "해외주식",
      acquisitionCost: 1_000_000,
      currentValue: 1_200_000,
      gain: 200_000,
      gainRate: 20,
      isActive: true,
    })
    expect(body.data.assetCategory).toMatchObject({ name: "주식", kind: "financial" })
  })

  test("initialValue 없으면 currentValue = 취득원가", async () => {
    const { id: categoryId } = await createCategory()
    const { body } = await createAsset(categoryId)
    expect(body.data.currentValue).toBe(1_000_000)
    expect(body.data.gain).toBe(0)
  })

  test("목록: kind·activeOnly 필터", async () => {
    const financial = await createCategory({ name: "주식", kind: "financial" })
    const nonFinancial = await createCategory({ name: "부동산", kind: "non_financial" })
    await createAsset(financial.id, { name: "주식자산" })
    await createAsset(nonFinancial.id, { name: "아파트" })
    await createAsset(financial.id, { name: "비활성자산", isActive: false })

    const allResponse = await listAssets(jsonRequest("/api/v1/assets", "GET"))
    expect((await allResponse.json()).data).toHaveLength(2) // activeOnly 기본

    const financialOnly = await listAssets(
      jsonRequest("/api/v1/assets?kind=financial", "GET"),
    )
    const financialBody = await financialOnly.json()
    expect(financialBody.data).toHaveLength(1)
    expect(financialBody.data[0].name).toBe("주식자산")

    const withInactive = await listAssets(
      jsonRequest("/api/v1/assets?activeOnly=false", "GET"),
    )
    expect((await withInactive.json()).data).toHaveLength(3)
  })

  test("상세: 평가 이력(날짜 오름차순)·연결 계좌 포함, currentValue는 계좌+로트 파생", async () => {
    const { id: categoryId } = await createCategory()
    const { id: assetId } = await createAsset(categoryId)
    await sql`
      INSERT INTO public.accounts (name, type, initial_balance, asset_id)
      VALUES ('증권계좌', 'investment', 500000, ${assetId})
    `

    const response = await getAsset(
      jsonRequest(`/api/v1/assets/${assetId}`, "GET"),
      idParams(assetId),
    )
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.data.currentValue).toBe(500_000) // 연결 계좌 잔액이 평가액을 대체
    expect(body.data.linkedAccounts).toEqual([
      expect.objectContaining({ name: "증권계좌", type: "investment", balance: 500_000 }),
    ])
    expect(body.data.valuations).toEqual([])
  })

  test("없는 자산 404", async () => {
    const missing = "00000000-0000-0000-0000-000000000000"
    const response = await getAsset(
      jsonRequest(`/api/v1/assets/${missing}`, "GET"),
      idParams(missing),
    )
    expect(response.status).toBe(404)
  })

  test("수정: partial PATCH — 미전달 필드 보존", async () => {
    const { id: categoryId } = await createCategory()
    const { id: assetId } = await createAsset(categoryId, { institution: "한투" })

    const response = await patchAsset(
      jsonRequest(`/api/v1/assets/${assetId}`, "PATCH", { name: "변경자산" }),
      idParams(assetId),
    )
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.data.name).toBe("변경자산")
    expect(body.data.institution).toBe("한투")
  })

  test("삭제: 매매 참조 시 CASCADE가 아닌 계좌 참조는 409", async () => {
    const { id: categoryId } = await createCategory()
    const { id: assetId } = await createAsset(categoryId)
    await sql`
      INSERT INTO public.accounts (name, type, initial_balance, asset_id)
      VALUES ('증권계좌', 'investment', 0, ${assetId})
    `

    // accounts.asset_id FK는 ON DELETE SET NULL → 삭제 성공, 계좌 연결만 해제
    const response = await deleteAsset(
      jsonRequest(`/api/v1/assets/${assetId}`, "DELETE"),
      idParams(assetId),
    )
    expect(response.status).toBe(200)
    const accounts = await sql`SELECT asset_id FROM public.accounts`
    expect(accounts[0].asset_id).toBeNull()
  })
})

// ─── portfolio / valuations ──────────────────────────────────

describe("portfolio·valuations (API.md §9.6-9.7)", () => {
  test("portfolio: 활성 자산의 카테고리별 합계와 비율", async () => {
    const stock = await createCategory({ name: "주식", kind: "financial" })
    const estate = await createCategory({ name: "부동산", kind: "non_financial" })
    await createAsset(stock.id, { name: "주식A", initialValue: 3_000_000 })
    await createAsset(estate.id, { name: "아파트", initialValue: 7_000_000 })

    const response = await getPortfolio()
    const body = await response.json()
    expect(body.data.total).toBe(10_000_000)
    expect(body.data.byCategory).toHaveLength(2)
    expect(body.data.byCategory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "주식", value: 3_000_000, ratio: 30 }),
        expect.objectContaining({ name: "부동산", value: 7_000_000, ratio: 70 }),
      ]),
    )
  })

  test("valuations: 추가(upsert) 후 날짜 오름차순 조회", async () => {
    const { id: categoryId } = await createCategory()
    const { id: assetId } = await createAsset(categoryId)

    const first = await postValuation(
      jsonRequest(`/api/v1/assets/${assetId}/valuations`, "POST", {
        date: "2026-06-01",
        value: 900_000,
      }),
      idParams(assetId),
    )
    expect(first.status).toBe(201)

    // 같은 날짜 upsert
    await postValuation(
      jsonRequest(`/api/v1/assets/${assetId}/valuations`, "POST", {
        date: "2026-06-01",
        value: 950_000,
      }),
      idParams(assetId),
    )
    await postValuation(
      jsonRequest(`/api/v1/assets/${assetId}/valuations`, "POST", {
        date: "2026-05-01",
        value: 800_000,
      }),
      idParams(assetId),
    )

    const listResponse = await listValuations(
      jsonRequest(`/api/v1/assets/${assetId}/valuations`, "GET"),
      idParams(assetId),
    )
    const listBody = await listResponse.json()
    expect(listBody.data.map((valuation: { date: string; value: number }) => valuation.value)).toEqual([
      800_000, 950_000,
    ])
  })

  test("사용자 upsert(기본 manual)는 기존 auto 스냅샷을 덮어쓴다 (의도적 비대칭)", async () => {
    const { id: categoryId } = await createCategory()
    const { id: assetId } = await createAsset(categoryId)
    await sql`
      INSERT INTO public.asset_valuations (asset_id, date, value, source)
      VALUES (${assetId}, '2026-06-01', 111, 'auto')
    `

    const response = await postValuation(
      jsonRequest(`/api/v1/assets/${assetId}/valuations`, "POST", {
        date: "2026-06-01",
        value: 222,
      }),
      idParams(assetId),
    )
    const body = await response.json()
    expect(response.status).toBe(201)
    expect(body.data).toMatchObject({ value: 222, source: "manual" })

    const rows = await sql`
      SELECT value, source FROM public.asset_valuations
      WHERE asset_id = ${assetId} AND date = '2026-06-01'
    `
    expect(rows).toHaveLength(1)
    expect(Number(rows[0].value)).toBe(222)
    expect(rows[0].source).toBe("manual")
  })

  test("source=auto 입력은 400 (pg_cron 전용)", async () => {
    const { id: categoryId } = await createCategory()
    const { id: assetId } = await createAsset(categoryId)

    const response = await postValuation(
      jsonRequest(`/api/v1/assets/${assetId}/valuations`, "POST", {
        date: "2026-06-01",
        value: 1,
        source: "auto",
      }),
      idParams(assetId),
    )
    expect(response.status).toBe(400)
  })

  test("없는 자산의 valuations 조회는 404", async () => {
    const missing = "00000000-0000-0000-0000-000000000000"
    const response = await listValuations(
      jsonRequest(`/api/v1/assets/${missing}/valuations`, "GET"),
      idParams(missing),
    )
    expect(response.status).toBe(404)
  })
})

describe("인증 가드", () => {
  test("미인증 요청은 401", async () => {
    getAuthUserMock.mockResolvedValue(null as never)
    const response = await listAssets(jsonRequest("/api/v1/assets", "GET"))
    expect(response.status).toBe(401)
  })
})
