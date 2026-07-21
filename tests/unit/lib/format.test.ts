import { describe, expect, test } from "vitest"

import { formatDateHeading, formatKrw, formatSignedKrw, ymOf } from "@/lib/format"

describe("formatKrw", () => {
  test("formats KRW integer with ko-KR grouping", () => {
    expect(formatKrw(1234567)).toBe("1,234,567원")
    expect(formatKrw(0)).toBe("0원")
  })

  test("formats negative amounts", () => {
    expect(formatKrw(-45000)).toBe("-45,000원")
  })
})

describe("formatSignedKrw", () => {
  test("prefixes plus for positive amounts", () => {
    expect(formatSignedKrw(45000)).toBe("+45,000원")
    expect(formatSignedKrw(-45000)).toBe("-45,000원")
    expect(formatSignedKrw(0)).toBe("0원")
  })
})

describe("ymOf", () => {
  test("extracts YYYY-MM from a date string", () => {
    expect(ymOf("2026-07-10")).toBe("2026-07")
  })
})

describe("formatDateHeading", () => {
  test("formats 'YYYY-MM-DD' as '{month}월 {day}일 ({weekday})' (MED-4: shared by TransactionList/HomeScreen)", () => {
    // 2026-07-03 은 금요일
    expect(formatDateHeading("2026-07-03")).toBe("7월 3일 (금)")
  })

  test("일요일도 정확히 표기한다", () => {
    // 2026-07-05 은 일요일
    expect(formatDateHeading("2026-07-05")).toBe("7월 5일 (일)")
  })
})
