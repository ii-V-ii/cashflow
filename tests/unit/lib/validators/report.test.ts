import { describe, expect, test } from "vitest"

import {
  reportCategoriesQuerySchema,
  reportNetWorthQuerySchema,
  reportTrendQuerySchema,
} from "@/lib/validators/report"

describe("reportTrendQuerySchema (API.md §14.1)", () => {
  test("from/to는 'YYYY-MM' 형식의 선택 파라미터다", () => {
    expect(reportTrendQuerySchema.parse({})).toEqual({})
    expect(reportTrendQuerySchema.parse({ from: "2025-08", to: "2026-07" })).toEqual({
      from: "2025-08",
      to: "2026-07",
    })
  })

  test("'YYYY-MM' 형식이 아니면 실패한다", () => {
    expect(() => reportTrendQuerySchema.parse({ from: "2025-8" })).toThrow()
    expect(() => reportTrendQuerySchema.parse({ from: "2025-13" })).toThrow()
    expect(() => reportTrendQuerySchema.parse({ to: "2025-00" })).toThrow()
  })

  test("from이 to보다 늦으면 실패한다", () => {
    expect(() =>
      reportTrendQuerySchema.parse({ from: "2026-08", to: "2026-07" }),
    ).toThrow()
  })
})

describe("reportCategoriesQuerySchema (API.md §14.2)", () => {
  test("year/month 필수", () => {
    expect(reportCategoriesQuerySchema.parse({ year: "2026", month: "7" })).toEqual({
      year: 2026,
      month: 7,
    })
    expect(() => reportCategoriesQuerySchema.parse({ year: "2026" })).toThrow()
  })
})

describe("reportNetWorthQuerySchema (API.md §14.3)", () => {
  test("months 기본 12, 1~60 범위", () => {
    expect(reportNetWorthQuerySchema.parse({})).toEqual({ months: 12 })
    expect(reportNetWorthQuerySchema.parse({ months: "24" })).toEqual({ months: 24 })
    expect(() => reportNetWorthQuerySchema.parse({ months: "0" })).toThrow()
    expect(() => reportNetWorthQuerySchema.parse({ months: "61" })).toThrow()
  })
})
