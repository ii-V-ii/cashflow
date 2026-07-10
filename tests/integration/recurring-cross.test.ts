import { afterAll, describe, expect, test } from "vitest"

import { calculateNextDate } from "@/lib/calculations/recurring-date"

import { NEXT_DATE_CASES } from "../fixtures/next-date-cases"
import { createTestDb } from "./helpers/db"

/**
 * TS calculateNextDate ↔ SQL calc_next_date 교차 검증 (docs/DB.md §3.6).
 * 동일한 케이스 테이블(tests/fixtures/next-date-cases.ts)을 양쪽에 투입해
 * 월말/윤년 보정과 "앵커=현재 일" 레거시 규칙이 어긋나지 않음을 보증한다.
 */
const sql = createTestDb()

afterAll(async () => {
  await sql.end()
})

describe("calc_next_date(SQL) ↔ calculateNextDate(TS) 케이스 테이블 교차 검증", () => {
  test.each(NEXT_DATE_CASES.map((c) => [c.name, c] as const))(
    "%s",
    async (_name, testCase) => {
      // Act
      const tsResult = calculateNextDate(
        testCase.current,
        testCase.frequency,
        testCase.interval,
      )
      const rows = await sql`
        SELECT to_char(
          public.calc_next_date(
            ${testCase.current}::date, ${testCase.frequency}, ${testCase.interval}
          ), 'YYYY-MM-DD') AS next
      `

      // Assert — 기대값 일치 + TS/SQL 상호 일치
      expect(tsResult).toBe(testCase.expected)
      expect(rows[0].next).toBe(testCase.expected)
    },
  )

  test("SQL도 알 수 없는 frequency를 거부한다 (23514)", async () => {
    await expect(
      sql`SELECT public.calc_next_date('2026-01-01'::date, 'hourly', 1)`,
    ).rejects.toMatchObject({ code: "23514" })
  })
})
