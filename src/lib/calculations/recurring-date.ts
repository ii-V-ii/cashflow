import type { RecurringFrequency } from "@/types"

/**
 * 정기거래 다음 발생일 계산 — 레거시 recurring-service.calculateNextDate 이식 (PRD §5 규칙 4).
 *
 * 월말/윤년 보정(H-5): 1/31 + 1개월 = 2/28(윤년 2/29), 2/29 + 1년 = 2/28.
 * 앵커는 "현재 날짜의 일(day)" — 1/31 → 2/28 이후에는 3/28로 진행한다(3/31 아님).
 * SQL `calc_next_date`(docs/DB.md §3.6)와 동일 규칙이며 케이스 테이블로 교차 검증한다.
 */
export function calculateNextDate(
  currentDate: string,
  frequency: RecurringFrequency,
  interval: number,
): string {
  const date = new Date(`${currentDate}T00:00:00`)
  const originalDay = date.getDate()

  switch (frequency) {
    case "daily":
      date.setDate(date.getDate() + interval)
      break
    case "weekly":
      date.setDate(date.getDate() + interval * 7)
      break
    case "monthly":
      date.setMonth(date.getMonth() + interval)
      // 월말 보정: 대상 월에 앵커 일이 없으면 이전 달 마지막 날로 내림
      if (date.getDate() !== originalDay) {
        date.setDate(0)
      }
      break
    case "yearly":
      date.setFullYear(date.getFullYear() + interval)
      // 윤년 보정: 2/29 + 평년 → 2/28
      if (date.getDate() !== originalDay) {
        date.setDate(0)
      }
      break
    default:
      throw new Error(`알 수 없는 frequency: ${String(frequency)}`)
  }

  return formatDateToYmd(date)
}

function formatDateToYmd(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}
