import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { dashboardQuerySchema } from "@/lib/validators/dashboard"

describe("dashboardQuerySchema (API.md §8.1)", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-10T09:00:00+09:00"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("year/month 미지정 시 현재 연·월을 기본값으로 쓴다", () => {
    expect(dashboardQuerySchema.parse({})).toEqual({ year: 2026, month: 7 })
  })

  test("명시된 year/month는 정수로 강제 변환한다", () => {
    expect(dashboardQuerySchema.parse({ year: "2025", month: "12" })).toEqual({
      year: 2025,
      month: 12,
    })
  })

  test("month 범위 밖은 실패한다", () => {
    expect(() => dashboardQuerySchema.parse({ month: "13" })).toThrow()
  })
})
