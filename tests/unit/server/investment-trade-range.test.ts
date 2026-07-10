import { describe, expect, test } from "vitest"

import { ApiError } from "@/server/api-errors"
import { rangeToScope } from "@/server/services/investment-trade-service"

/**
 * from/to → get_investment_summary scope 매핑 (API.md §11.6 구현 메모).
 * 순수 함수 — 경계·윤년·역전 범위를 저비용으로 고정한다.
 */
describe("rangeToScope", () => {
  test("둘 다 없으면 scope=all", () => {
    expect(rangeToScope(undefined, undefined)).toEqual({ scope: "all" })
  })

  test("한쪽만 제공하면 400", () => {
    expect(() => rangeToScope("2026-01-01", undefined)).toThrowError(ApiError)
    expect(() => rangeToScope(undefined, "2026-12-31")).toThrowError(ApiError)
  })

  test("연도 경계(1/1~12/31) → scope=year", () => {
    expect(rangeToScope("2026-01-01", "2026-12-31")).toEqual({
      scope: "year",
      year: 2026,
    })
  })

  test("연도가 다르면 400", () => {
    expect(() => rangeToScope("2026-01-01", "2027-12-31")).toThrowError(ApiError)
  })

  test("평년 2월(1일~28일) → scope=month", () => {
    expect(rangeToScope("2027-02-01", "2027-02-28")).toEqual({
      scope: "month",
      year: 2027,
      month: 2,
    })
  })

  test("윤년 2월(1일~29일) → scope=month", () => {
    expect(rangeToScope("2028-02-01", "2028-02-29")).toEqual({
      scope: "month",
      year: 2028,
      month: 2,
    })
  })

  test("평년에 2/29를 말일로 주면 400", () => {
    expect(() => rangeToScope("2026-02-01", "2026-02-29")).toThrowError(ApiError)
  })

  test("12월 경계(12/1~12/31) → scope=month (연도 경계와 혼동 없음)", () => {
    expect(rangeToScope("2026-12-01", "2026-12-31")).toEqual({
      scope: "month",
      year: 2026,
      month: 12,
    })
  })

  test("역전 범위는 400", () => {
    expect(() => rangeToScope("2026-12-31", "2026-01-01")).toThrowError(ApiError)
  })

  test("월 중간 임의 구간은 400", () => {
    expect(() => rangeToScope("2026-01-03", "2026-02-11")).toThrowError(ApiError)
  })
})
