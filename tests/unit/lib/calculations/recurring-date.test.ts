import { describe, expect, test } from "vitest"

import { calculateNextDate } from "@/lib/calculations/recurring-date"
import { NEXT_DATE_CASES } from "../../../fixtures/next-date-cases"

/**
 * 정기거래 다음 발생일 계산 — 레거시 calculateNextDate(H-5 월말/윤년 보정) 케이스 이식.
 * SQL calc_next_date와의 교차 검증은 tests/integration/recurring-cross.test.ts 참조.
 */
describe("calculateNextDate", () => {
  test.each(NEXT_DATE_CASES.map((c) => [c.name, c] as const))(
    "%s",
    (_name, testCase) => {
      // Arrange & Act
      const result = calculateNextDate(
        testCase.current,
        testCase.frequency,
        testCase.interval,
      )

      // Assert
      expect(result).toBe(testCase.expected)
    },
  )

  test("연쇄 진행: 1/31 → 2/28 → 3/28 (레거시 앵커 규칙 보존)", () => {
    // Arrange
    const first = calculateNextDate("2026-01-31", "monthly", 1)

    // Act
    const second = calculateNextDate(first, "monthly", 1)

    // Assert
    expect(first).toBe("2026-02-28")
    expect(second).toBe("2026-03-28")
  })

  test("알 수 없는 frequency는 예외를 던진다", () => {
    expect(() =>
      calculateNextDate("2026-01-01", "hourly" as never, 1),
    ).toThrow()
  })
})
