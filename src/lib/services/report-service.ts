import { and, eq, sql } from 'drizzle-orm'
import { getDb } from '@/db/index'
import { transactions, categories, accounts } from '@/db/schema'
import { successResponse } from '@/lib/api-response'
import type {
  ApiResponse,
  IncomeExpenseTrendItem,
  CategoryAnalysis,
  CategoryAnalysisItem,
  NetWorthPoint,
} from '@/types'

export async function getIncomeExpenseTrend(
  from: string, // YYYY-MM
  to: string,   // YYYY-MM
): Promise<ApiResponse<readonly IncomeExpenseTrendItem[]>> {
  const db = getDb()

  const rows = await db
    .select({
      yearMonth: sql<string>`substr(${transactions.date}, 1, 7)`.as('yearMonth'),
      type: transactions.type,
      total: sql<number>`sum(${transactions.amount})`.as('total'),
    })
    .from(transactions)
    .where(
      and(
        sql`substr(${transactions.date}, 1, 7) >= ${from}`,
        sql`substr(${transactions.date}, 1, 7) <= ${to}`,
        sql`${transactions.type} in ('income', 'expense')`,
      ),
    )
    .groupBy(sql`substr(${transactions.date}, 1, 7)`, transactions.type)

  const monthMap = new Map<string, { income: number; expense: number }>()

  // from~to 범위의 모든 월을 생성
  const allMonths = generateMonthRange(from, to)
  for (const ym of allMonths) {
    monthMap.set(ym, { income: 0, expense: 0 })
  }

  for (const row of rows) {
    const existing = monthMap.get(row.yearMonth) ?? { income: 0, expense: 0 }
    if (row.type === 'income') existing.income = row.total
    else if (row.type === 'expense') existing.expense = row.total
    monthMap.set(row.yearMonth, existing)
  }

  const items: IncomeExpenseTrendItem[] = allMonths.map((ym) => {
    const data = monthMap.get(ym)!
    return {
      yearMonth: ym,
      income: data.income,
      expense: data.expense,
      netIncome: data.income - data.expense,
    }
  })

  return successResponse(items)
}

export async function getCategoryAnalysis(
  year: number,
  month: number,
): Promise<ApiResponse<CategoryAnalysis>> {
  const db = getDb()
  const datePrefix = `${year}-${String(month).padStart(2, '0')}`

  // 소분류→대분류 롤업
  const rows = await db.execute(sql`
    SELECT
      COALESCE(c.parent_id, c.id) AS category_id,
      COALESCE(pc.name, c.name, '미분류') AS category_name,
      SUM(t.amount) AS amount
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN categories pc ON c.parent_id = pc.id
    WHERE t.date LIKE ${datePrefix + '%'}
      AND t.type = 'expense'
    GROUP BY COALESCE(c.parent_id, c.id), COALESCE(pc.name, c.name, '미분류')
    ORDER BY SUM(t.amount) DESC
  `) as unknown as Array<{ category_id: string | null; category_name: string; amount: number }>

  const totalExpense = rows.reduce((sum, r) => sum + r.amount, 0)

  const items: CategoryAnalysisItem[] = rows.map((row, index) => ({
    categoryId: row.category_id ?? '',
    categoryName: row.category_name ?? '미분류',
    amount: row.amount,
    ratio: totalExpense > 0 ? Math.round((row.amount / totalExpense) * 10000) / 100 : 0,
    rank: index + 1,
  }))

  return successResponse({
    year,
    month,
    totalExpense,
    items,
  })
}

export async function getNetWorthTrend(
  months: number,
): Promise<ApiResponse<readonly NetWorthPoint[]>> {
  const db = getDb()

  // 현재 전체 계좌 잔액 합계
  const allAccounts = await db.select().from(accounts)
  const currentTotal = allAccounts.reduce((sum, a) => sum + a.currentBalance, 0)

  // 최근 N개월 범위 생성
  const now = new Date()

  const monthList = generatePastMonths(now, months)

  // 각 월 이후의 전체 거래 효과를 역산하여 해당 월 말 잔액 추정
  // 해당 월 말 잔액 = 현재 잔액 - (해당월 다음달~현재까지의 거래 효과)
  const points: NetWorthPoint[] = []

  for (const ym of monthList) {
    const nextMonth = getNextMonth(ym)
    const effectAfter = await getTotalEffectsFrom(nextMonth)
    const balance = currentTotal - effectAfter

    points.push({
      yearMonth: ym,
      totalBalance: balance,
    })
  }

  return successResponse(points)
}

// === Internal Helpers ===

function generateMonthRange(from: string, to: string): string[] {
  const result: string[] = []
  const [startYear, startMonth] = from.split('-').map(Number)
  const [endYear, endMonth] = to.split('-').map(Number)

  let y = startYear
  let m = startMonth

  while (y < endYear || (y === endYear && m <= endMonth)) {
    result.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }

  return result
}

function generatePastMonths(now: Date, count: number): string[] {
  const result: string[] = []
  let y = now.getFullYear()
  let m = now.getMonth() + 1

  for (let i = 0; i < count; i++) {
    result.unshift(`${y}-${String(m).padStart(2, '0')}`)
    m--
    if (m < 1) {
      m = 12
      y--
    }
  }

  return result
}

function getNextMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number)
  const nextM = m === 12 ? 1 : m + 1
  const nextY = m === 12 ? y + 1 : y
  return `${nextY}-${String(nextM).padStart(2, '0')}`
}

async function getTotalEffectsFrom(fromYearMonth: string): Promise<number> {
  const db = getDb()
  const fromDate = `${fromYearMonth}-01`

  // income adds to balance
  const incomeRows = await db
    .select({ total: sql<number>`coalesce(sum(${transactions.amount}), 0)`.as('total') })
    .from(transactions)
    .where(
      and(
        eq(transactions.type, 'income'),
        sql`${transactions.date} >= ${fromDate}`,
      ),
    )

  // expense subtracts from balance
  const expenseRows = await db
    .select({ total: sql<number>`coalesce(sum(${transactions.amount}), 0)`.as('total') })
    .from(transactions)
    .where(
      and(
        eq(transactions.type, 'expense'),
        sql`${transactions.date} >= ${fromDate}`,
      ),
    )

  // transfers are net-zero across all accounts
  return (incomeRows[0]?.total ?? 0) - (expenseRows[0]?.total ?? 0)
}
