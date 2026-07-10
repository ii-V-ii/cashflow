import { describe, expect, test } from "vitest"

import {
  settlementAnnualQuerySchema,
  settlementMonthlyQuerySchema,
} from "@/lib/validators/settlement"

describe("settlementMonthlyQuerySchema (API.md §7.1)", () => {
  test("쿼리스트링 문자열 year/month를 정수로 강제 변환한다", () => {
    const parsed = settlementMonthlyQuerySchema.parse({ year: "2026", month: "7" })
    expect(parsed).toEqual({ year: 2026, month: 7 })
  })

  test("month 범위(1~12)를 벗어나면 실패한다", () => {
    expect(() => settlementMonthlyQuerySchema.parse({ year: "2026", month: "0" })).toThrow()
    expect(() => settlementMonthlyQuerySchema.parse({ year: "2026", month: "13" })).toThrow()
  })

  test("year 누락 시 실패한다", () => {
    expect(() => settlementMonthlyQuerySchema.parse({ month: "7" })).toThrow()
  })

  test("정수가 아닌 값은 실패한다", () => {
    expect(() => settlementMonthlyQuerySchema.parse({ year: "2026.5", month: "7" })).toThrow()
    expect(() => settlementMonthlyQuerySchema.parse({ year: "abc", month: "7" })).toThrow()
  })
})

describe("settlementAnnualQuerySchema (API.md §7.2)", () => {
  test("year만 필수로 받는다", () => {
    expect(settlementAnnualQuerySchema.parse({ year: "2026" })).toEqual({ year: 2026 })
  })

  test("year 누락/비정상 값은 실패한다", () => {
    expect(() => settlementAnnualQuerySchema.parse({})).toThrow()
    expect(() => settlementAnnualQuerySchema.parse({ year: "999" })).toThrow()
  })
})
