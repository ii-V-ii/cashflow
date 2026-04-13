import { and, sql, eq } from 'drizzle-orm'
import { getDb } from '@/db/index'
import { transactions } from '@/db/schema'
import { findActiveRecurringTransactions } from '@/db/repositories'
import { calculateNextDate } from '@/lib/services/recurring-service'
import type { ForecastAssumptions, RecurringFrequency } from '@/types'

interface MonthlyProjection {
  readonly date: string // YYYY-MM-01
  readonly projectedIncome: number
  readonly projectedExpense: number
  readonly recurringIncome: number
  readonly recurringExpense: number
  readonly historicalIncome: number
  readonly historicalExpense: number
}

/**
 * 과거 데이터 기반 월별 평균 수입/지출 계산 (최근 12개월)
 */
export async function getHistoricalMonthlyAverages(): Promise<{
  avgIncome: number
  avgExpense: number
}> {
  const db = getDb()

  const rows = await db
    .select({
      type: transactions.type,
      month: sql<string>`substr(${transactions.date}, 1, 7)`.as('month'),
      total: sql<number>`sum(${transactions.amount})`.as('total'),
    })
    .from(transactions)
    .where(sql`${transactions.type} in ('income', 'expense')`)
    .groupBy(sql`substr(${transactions.date}, 1, 7)`, transactions.type)

  const monthlyIncome = new Map<string, number>()
  const monthlyExpense = new Map<string, number>()

  for (const row of rows) {
    if (row.type === 'income') {
      monthlyIncome.set(row.month, row.total)
    } else if (row.type === 'expense') {
      monthlyExpense.set(row.month, row.total)
    }
  }

  const incomeValues = Array.from(monthlyIncome.values())
  const expenseValues = Array.from(monthlyExpense.values())

  // 최근 12개월만 사용
  const recentIncome = incomeValues.slice(-12)
  const recentExpense = expenseValues.slice(-12)

  const avgIncome =
    recentIncome.length > 0
      ? Math.round(recentIncome.reduce((a, b) => a + b, 0) / recentIncome.length)
      : 0
  const avgExpense =
    recentExpense.length > 0
      ? Math.round(recentExpense.reduce((a, b) => a + b, 0) / recentExpense.length)
      : 0

  return { avgIncome, avgExpense }
}

/**
 * 정기 거래를 특정 월에 반영하여 수입/지출 계산
 */
export async function getRecurringForMonth(
  yearMonth: string, // YYYY-MM
): Promise<{ recurringIncome: number; recurringExpense: number }> {
  const activeRecurrings = await findActiveRecurringTransactions()
  const monthStart = `${yearMonth}-01`
  const lastDay = getLastDayOfMonth(yearMonth)
  const monthEnd = `${yearMonth}-${String(lastDay).padStart(2, '0')}`

  let recurringIncome = 0
  let recurringExpense = 0

  for (const recurring of activeRecurrings) {
    // 종료일이 월 시작 이전이면 건너뜀
    if (recurring.endDate && recurring.endDate < monthStart) continue
    // 시작일이 월 끝 이후이면 건너뜀
    if (recurring.startDate > monthEnd) continue

    const occurrences = countOccurrencesInMonth(
      recurring.nextDate,
      recurring.frequency as RecurringFrequency,
      recurring.interval,
      monthStart,
      monthEnd,
    )

    const amount = recurring.amount * occurrences
    if (recurring.type === 'income') {
      recurringIncome += amount
    } else if (recurring.type === 'expense') {
      recurringExpense += amount
    }
  }

  return { recurringIncome, recurringExpense }
}

/**
 * 캐시플로우 예측 실행
 */
export async function projectCashflow(
  startDate: string, // YYYY-MM-DD
  endDate: string, // YYYY-MM-DD
  assumptions: ForecastAssumptions | null,
): Promise<readonly MonthlyProjection[]> {
  const { avgIncome, avgExpense } = await getHistoricalMonthlyAverages()
  const incomeGrowthRate = (assumptions?.incomeGrowthRate ?? 0) / 100 / 12 // 월간 환산
  const expenseGrowthRate = (assumptions?.expenseGrowthRate ?? 0) / 100 / 12

  const projections: MonthlyProjection[] = []
  const startYM = startDate.substring(0, 7)
  const endYM = endDate.substring(0, 7)

  let currentYM = startYM
  let monthIndex = 0

  while (currentYM <= endYM) {
    const recurring = await getRecurringForMonth(currentYM)

    // 시간 경과에 따른 증가율 적용
    const growthMultiplierIncome = Math.pow(1 + incomeGrowthRate, monthIndex)
    const growthMultiplierExpense = Math.pow(1 + expenseGrowthRate, monthIndex)

    const historicalIncome = Math.round(avgIncome * growthMultiplierIncome)
    const historicalExpense = Math.round(avgExpense * growthMultiplierExpense)

    projections.push({
      date: `${currentYM}-01`,
      projectedIncome: historicalIncome + recurring.recurringIncome,
      projectedExpense: historicalExpense + recurring.recurringExpense,
      recurringIncome: recurring.recurringIncome,
      recurringExpense: recurring.recurringExpense,
      historicalIncome,
      historicalExpense,
    })

    currentYM = nextYearMonth(currentYM)
    monthIndex++
  }

  return projections
}

// === Helpers ===

function getLastDayOfMonth(yearMonth: string): number {
  const [year, month] = yearMonth.split('-').map(Number)
  return new Date(year, month, 0).getDate()
}

function nextYearMonth(ym: string): string {
  const [year, month] = ym.split('-').map(Number)
  if (month === 12) return `${year + 1}-01`
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

function countOccurrencesInMonth(
  nextDate: string,
  frequency: RecurringFrequency,
  interval: number,
  monthStart: string,
  monthEnd: string,
): number {
  let count = 0
  let current = nextDate

  // nextDate가 월 시작 이전이면 앞으로 이동
  while (current < monthStart) {
    current = calculateNextDate(current, frequency, interval)
  }

  // 월 범위 내 횟수 카운트
  while (current <= monthEnd) {
    count++
    current = calculateNextDate(current, frequency, interval)
  }

  return count
}
