import type { ForecastAssumptions, RecurringFrequency } from "@/types"

/**
 * 현금흐름 예측 — 프레임워크 독립 순수 함수 (API.md §13, PRD §3.9).
 * 레거시 main:src/lib/forecast/cashflow-forecast.ts 이식.
 * DB 접근을 제거하고 입력(이력 평균·정기 거래)을 인자로 받는 순수 형태로 재구성 —
 * 수식(연간 증가율의 월할 복리, 발생 횟수 계산)은 레거시와 동일하다.
 */

export interface RecurringItem {
  readonly type: "income" | "expense"
  readonly amount: number
  readonly frequency: RecurringFrequency
  readonly interval: number
  readonly nextDate: string // YYYY-MM-DD
  readonly startDate: string // YYYY-MM-DD
  readonly endDate: string | null
}

export interface CashflowInputs {
  readonly avgIncome: number
  readonly avgExpense: number
  readonly recurrings: readonly RecurringItem[]
}

export interface MonthlyProjection {
  readonly date: string // YYYY-MM-01
  readonly projectedIncome: number
  readonly projectedExpense: number
  readonly recurringIncome: number
  readonly recurringExpense: number
  readonly historicalIncome: number
  readonly historicalExpense: number
}

export interface MonthlyTotalRow {
  readonly type: "income" | "expense"
  readonly total: number
}

/** 월별 합계 행(최근 12개월 집계 결과)에서 수입/지출 평균 계산 */
export function averageMonthlyTotals(rows: readonly MonthlyTotalRow[]): {
  avgIncome: number
  avgExpense: number
} {
  const monthlyIncome = rows.filter((row) => row.type === "income")
  const monthlyExpense = rows.filter((row) => row.type === "expense")

  const average = (values: readonly MonthlyTotalRow[]): number =>
    values.length > 0
      ? Math.round(values.reduce((sum, row) => sum + row.total, 0) / values.length)
      : 0

  return { avgIncome: average(monthlyIncome), avgExpense: average(monthlyExpense) }
}

/**
 * 다음 발생일 계산 (레거시 recurring-service.calculateNextDate 이식,
 * H-5 월말/윤년 보정 포함)
 */
export function calculateNextDate(
  currentDate: string,
  frequency: RecurringFrequency,
  interval: number,
): string {
  const date = new Date(currentDate + "T00:00:00")
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
      // 월말 보정 (예: 1/31 + 1개월 → 3/3이 아닌 2/28)
      if (date.getDate() !== originalDay) {
        date.setDate(0) // 이전 달 마지막 날
      }
      break
    case "yearly":
      date.setFullYear(date.getFullYear() + interval)
      // 윤년 보정 (예: 2/29 + 1년 → 2/28)
      if (date.getDate() !== originalDay) {
        date.setDate(0)
      }
      break
  }

  return formatDateToYmd(date)
}

const DAY_MS = 86_400_000

/** 월 범위 내 정기 거래 발생 횟수 (레거시 countOccurrencesInMonth 이식) */
export function countOccurrencesInMonth(
  nextDate: string,
  frequency: RecurringFrequency,
  interval: number,
  monthStart: string,
  monthEnd: string,
): number {
  // daily 최적화: 루프 대신 날짜 차이로 직접 계산
  if (frequency === "daily") {
    const start = new Date(monthStart > nextDate ? monthStart : nextDate)
    const end = new Date(monthEnd)
    if (start > end) return 0

    if (interval === 1) {
      return Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1
    }

    const nextD = new Date(nextDate)
    const daysSinceNext = Math.floor((start.getTime() - nextD.getTime()) / DAY_MS)
    const remainder = daysSinceNext % interval
    const firstOccurrence =
      remainder === 0
        ? start
        : new Date(start.getTime() + (interval - remainder) * DAY_MS)
    if (firstOccurrence > end) return 0

    return (
      Math.floor((end.getTime() - firstOccurrence.getTime()) / (interval * DAY_MS)) + 1
    )
  }

  let count = 0
  let current = nextDate

  while (current < monthStart) {
    current = calculateNextDate(current, frequency, interval)
  }
  while (current <= monthEnd) {
    count++
    current = calculateNextDate(current, frequency, interval)
  }

  return count
}

/** 특정 월(YYYY-MM)의 정기 수입/지출 합산 */
export function getRecurringForMonth(
  yearMonth: string,
  recurrings: readonly RecurringItem[],
): { recurringIncome: number; recurringExpense: number } {
  const monthStart = `${yearMonth}-01`
  const lastDay = getLastDayOfMonth(yearMonth)
  const monthEnd = `${yearMonth}-${String(lastDay).padStart(2, "0")}`

  let recurringIncome = 0
  let recurringExpense = 0

  for (const item of recurrings) {
    if (item.endDate && item.endDate < monthStart) continue
    if (item.startDate > monthEnd) continue

    const occurrences = countOccurrencesInMonth(
      item.nextDate,
      item.frequency,
      item.interval,
      monthStart,
      monthEnd,
    )

    const amount = item.amount * occurrences
    if (item.type === "income") {
      recurringIncome += amount
    } else {
      recurringExpense += amount
    }
  }

  return { recurringIncome, recurringExpense }
}

/**
 * 현금흐름 예측: 이력 평균 × 증가율(연간 %의 월할 복리) + 정기 거래.
 * 레거시 projectCashflow와 동일 수식 — 순수 함수로 입력을 주입받는다.
 */
export function projectCashflow(
  startDate: string, // YYYY-MM-DD
  endDate: string, // YYYY-MM-DD
  assumptions: ForecastAssumptions | null,
  inputs: CashflowInputs,
): readonly MonthlyProjection[] {
  const incomeGrowthRate = (assumptions?.incomeGrowthRate ?? 0) / 100 / 12 // 월간 환산
  const expenseGrowthRate = (assumptions?.expenseGrowthRate ?? 0) / 100 / 12

  const projections: MonthlyProjection[] = []
  const startYm = startDate.substring(0, 7)
  const endYm = endDate.substring(0, 7)

  let currentYm = startYm
  let monthIndex = 0

  while (currentYm <= endYm) {
    const recurring = getRecurringForMonth(currentYm, inputs.recurrings)

    const growthMultiplierIncome = Math.pow(1 + incomeGrowthRate, monthIndex)
    const growthMultiplierExpense = Math.pow(1 + expenseGrowthRate, monthIndex)

    const historicalIncome = Math.round(inputs.avgIncome * growthMultiplierIncome)
    const historicalExpense = Math.round(inputs.avgExpense * growthMultiplierExpense)

    projections.push({
      date: `${currentYm}-01`,
      projectedIncome: historicalIncome + recurring.recurringIncome,
      projectedExpense: historicalExpense + recurring.recurringExpense,
      recurringIncome: recurring.recurringIncome,
      recurringExpense: recurring.recurringExpense,
      historicalIncome,
      historicalExpense,
    })

    currentYm = nextYearMonth(currentYm)
    monthIndex++
  }

  return projections
}

// === Helpers ===

function getLastDayOfMonth(yearMonth: string): number {
  const [year, month] = yearMonth.split("-").map(Number)
  return new Date(year, month, 0).getDate()
}

function nextYearMonth(ym: string): string {
  const [year, month] = ym.split("-").map(Number)
  if (month === 12) return `${year + 1}-01`
  return `${year}-${String(month + 1).padStart(2, "0")}`
}

function formatDateToYmd(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}
