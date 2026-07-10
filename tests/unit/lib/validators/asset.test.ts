import { describe, expect, test } from "vitest"

import {
  createAssetCategorySchema,
  createAssetSchema,
  createValuationSchema,
  listAssetsQuerySchema,
  updateAssetCategorySchema,
  updateAssetSchema,
} from "@/lib/validators"

describe("createAssetSchema (API.md §9.2)", () => {
  const valid = {
    name: "해외주식",
    assetCategoryId: "1b671a64-40d5-491e-99b0-da01ff1f3341",
    acquisitionDate: "2026-01-01",
    acquisitionCost: 1_000_000,
  }

  test("유효 본문 통과 + isActive 기본 true", () => {
    const parsed = createAssetSchema.parse(valid)
    expect(parsed.isActive).toBe(true)
    expect(parsed.initialValue).toBeUndefined()
  })

  test("initialValue는 0 이상 선택 입력", () => {
    expect(createAssetSchema.parse({ ...valid, initialValue: 0 }).initialValue).toBe(0)
    expect(() => createAssetSchema.parse({ ...valid, initialValue: -1 })).toThrow()
  })

  test("name 길이·acquisitionCost 음수 거부", () => {
    expect(() => createAssetSchema.parse({ ...valid, name: "" })).toThrow()
    expect(() => createAssetSchema.parse({ ...valid, name: "a".repeat(101) })).toThrow()
    expect(() => createAssetSchema.parse({ ...valid, acquisitionCost: -1 })).toThrow()
  })

  test("updateAssetSchema는 partial — 빈 객체 허용, initialValue 불허(§9.7)", () => {
    expect(updateAssetSchema.parse({})).toEqual({})
    expect(updateAssetSchema.parse({ name: "변경" })).toEqual({ name: "변경" })
    // strip: 알 수 없는 키 제거
    expect(updateAssetSchema.parse({ initialValue: 100 })).toEqual({})
  })
})

describe("listAssetsQuerySchema (API.md §9.1)", () => {
  test("기본값: activeOnly=true", () => {
    expect(listAssetsQuerySchema.parse({})).toEqual({ activeOnly: true })
  })

  test("kind 필터 + activeOnly=false 파싱", () => {
    expect(
      listAssetsQuerySchema.parse({ kind: "financial", activeOnly: "false" }),
    ).toEqual({ kind: "financial", activeOnly: false })
    expect(() => listAssetsQuerySchema.parse({ kind: "other" })).toThrow()
  })
})

describe("createValuationSchema (API.md §9.7)", () => {
  test("기본 source=manual, auto는 pg_cron 전용이라 거부", () => {
    const parsed = createValuationSchema.parse({ date: "2026-07-01", value: 100 })
    expect(parsed.source).toBe("manual")
    expect(() =>
      createValuationSchema.parse({ date: "2026-07-01", value: 100, source: "auto" }),
    ).toThrow()
  })

  test("음수 value 거부", () => {
    expect(() =>
      createValuationSchema.parse({ date: "2026-07-01", value: -1 }),
    ).toThrow()
  })
})

describe("asset-category 스키마 (API.md §10)", () => {
  test("createAssetCategorySchema: name 1~50 + kind 필수, sortOrder 기본 0", () => {
    const parsed = createAssetCategorySchema.parse({ name: "주식", kind: "financial" })
    expect(parsed.sortOrder).toBe(0)
    expect(() =>
      createAssetCategorySchema.parse({ name: "", kind: "financial" }),
    ).toThrow()
    expect(() => createAssetCategorySchema.parse({ name: "주식" })).toThrow()
  })

  test("updateAssetCategorySchema는 partial", () => {
    expect(updateAssetCategorySchema.parse({})).toEqual({})
    expect(updateAssetCategorySchema.parse({ kind: "non_financial" })).toEqual({
      kind: "non_financial",
    })
  })
})
