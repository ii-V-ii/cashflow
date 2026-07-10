import type { RecurringFrequency } from "@/types"

/**
 * calculateNextDate(TS) ↔ calc_next_date(SQL) 공유 케이스 테이블.
 * 레거시 recurring-service.calculateNextDate(H-5 월말/윤년 보정) 동작 보존이 기준이다.
 *
 * 핵심 레거시 규칙: 앵커는 "현재 날짜의 일(day)" — 1/31 → 2/28 이후에는
 * 2/28을 앵커로 3/28로 진행한다(3/31 아님). docs/DB.md §3.6 주의 참조.
 */
export interface NextDateCase {
  name: string
  current: string
  frequency: RecurringFrequency
  interval: number
  expected: string
}

export const NEXT_DATE_CASES: readonly NextDateCase[] = [
  // ── daily ──────────────────────────────────────────────
  { name: "daily +1", current: "2026-01-01", frequency: "daily", interval: 1, expected: "2026-01-02" },
  { name: "daily 월 경계", current: "2026-01-31", frequency: "daily", interval: 1, expected: "2026-02-01" },
  { name: "daily 평년 2월 경계", current: "2026-02-27", frequency: "daily", interval: 3, expected: "2026-03-02" },
  { name: "daily 윤년 2/29 진입", current: "2024-02-28", frequency: "daily", interval: 1, expected: "2024-02-29" },
  { name: "daily 연 경계", current: "2026-12-31", frequency: "daily", interval: 1, expected: "2027-01-01" },

  // ── weekly ─────────────────────────────────────────────
  { name: "weekly +1", current: "2026-01-01", frequency: "weekly", interval: 1, expected: "2026-01-08" },
  { name: "weekly +2 월 경계", current: "2026-01-31", frequency: "weekly", interval: 2, expected: "2026-02-14" },
  { name: "weekly 연 경계", current: "2026-12-28", frequency: "weekly", interval: 1, expected: "2027-01-04" },

  // ── monthly: 월말 보정 ──────────────────────────────────
  { name: "1/31 + 1개월 = 2/28 (평년)", current: "2026-01-31", frequency: "monthly", interval: 1, expected: "2026-02-28" },
  { name: "1/31 + 1개월 = 2/29 (윤년)", current: "2024-01-31", frequency: "monthly", interval: 1, expected: "2024-02-29" },
  { name: "3/31 + 1개월 = 4/30", current: "2026-03-31", frequency: "monthly", interval: 1, expected: "2026-04-30" },
  { name: "5/31 + 1개월 = 6/30", current: "2026-05-31", frequency: "monthly", interval: 1, expected: "2026-06-30" },
  { name: "8/31 + 1개월 = 9/30", current: "2026-08-31", frequency: "monthly", interval: 1, expected: "2026-09-30" },
  { name: "12/31 + 1개월 = 1/31 (연 경계)", current: "2026-12-31", frequency: "monthly", interval: 1, expected: "2027-01-31" },
  // 레거시 앵커 규칙: 2/28 이후에는 28일이 앵커 (3/31로 복원하지 않는다)
  { name: "2/28 + 1개월 = 3/28 (앵커=현재 일)", current: "2026-02-28", frequency: "monthly", interval: 1, expected: "2026-03-28" },
  { name: "4/30 + 1개월 = 5/30 (앵커=30)", current: "2026-04-30", frequency: "monthly", interval: 1, expected: "2026-05-30" },
  // 30일 월 중간값·간격
  { name: "1/15 + 2개월 = 3/15", current: "2026-01-15", frequency: "monthly", interval: 2, expected: "2026-03-15" },
  { name: "1/30 + 1개월 = 2/28 (평년 30일 앵커)", current: "2026-01-30", frequency: "monthly", interval: 1, expected: "2026-02-28" },
  { name: "12/31 + 2개월 = 2/28 (평년)", current: "2026-12-31", frequency: "monthly", interval: 2, expected: "2027-02-28" },
  { name: "3/31 + 12개월 = 다음해 3/31", current: "2026-03-31", frequency: "monthly", interval: 12, expected: "2027-03-31" },

  // ── yearly: 윤년 보정 ───────────────────────────────────
  { name: "2/29(윤년) + 1년 = 2/28", current: "2024-02-29", frequency: "yearly", interval: 1, expected: "2025-02-28" },
  { name: "2/29(윤년) + 4년 = 2/29", current: "2024-02-29", frequency: "yearly", interval: 4, expected: "2028-02-29" },
  { name: "12/31 + 1년 = 12/31", current: "2025-12-31", frequency: "yearly", interval: 1, expected: "2026-12-31" },
  { name: "6/15 + 2년 = 6/15", current: "2026-06-15", frequency: "yearly", interval: 2, expected: "2028-06-15" },
] as const
