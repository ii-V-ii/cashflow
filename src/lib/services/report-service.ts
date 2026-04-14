import { and, sql, gte, lt } from 'drizzle-orm'
import { getDb } from '@/db/index'
import { transactions, categories, accounts } from '@/db/schema'
import { successResponse } from '@/lib/api-response'
import { monthDateRange } from '@/lib/utils'
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
  const fromDate = `${from}-01`
  const toDate = nextMonthStart(to)

  // M-2: SUM()::integer, 날짜: to_char + 범위 쿼리, H-2: status='applied'
  const rows = await db
    .select({
      yearMonth: sql<string>`to_char(${transactions.date}, 'YYYY-MM')`.as('yearMonth'),
      type: transactions.type,
      total: sql<number>`sum(${transactions.amount})::integer`.as('total'),
    })
    .from(transactions)
    .where(
      and(
        gte(transactions.date, fromDate),
        lt(transactions.date, toDate),
        sql`${transactions.type} in ('income', 'expense')`,
        sql`${transactions.status} = 'applied'`,
      ),
    )
    .groupBy(sql`to_char(${transactions.date}, 'YYYY-MM')`, transactions.type)

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
  const { start, end } = monthDateRange(year, month)

  // 소분류→대분류 롤업, M-2: SUM()::integer, 날짜: 범위 쿼리
  const rows = await db.execute(sql`
    SELECT
      COALESCE(c.parent_id, c.id) AS category_id,
      COALESCE(pc.name, c.name, '미분류') AS category_name,
      SUM(t.amount)::integer AS amount
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN categories pc ON c.parent_id = pc.id
    WHERE t.date >= ${start} AND t.date < ${end}
      AND t.type = 'expense'
      AND t.status = 'applied'
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

// H-3: 월별 루프 → 단일 쿼리 + 누적합
export async function getNetWorthTrend(
  months: number,
): Promise<ApiResponse<readonly NetWorthPoint[]>> {
  const db = getDb()
  const now = new Date()
  const monthList = generatePastMonths(now, months)

  if (monthList.length === 0) return successResponse([])

  const startDate = `${monthList[0]}-01`

  // 병렬: 초기잔액 SUM + 시작일 이전 누적효과 + 요청 범위 월별 효과
  const [balanceRows, priorRows, monthlyRows] = await Promise.all([
    db
      .select({ total: sql<number>`coalesce(sum(${accounts.initialBalance}), 0)::integer`.as('total') })
      .from(accounts),
    db.execute(sql`
      SELECT coalesce(SUM(CASE WHEN type = 'income' THEN amount WHEN type = 'expense' THEN -amount ELSE 0 END), 0)::integer AS prior_effect
      FROM transactions
      WHERE status = 'applied' AND date < ${startDate}
    `) as unknown as Promise<Array<{ prior_effect: number }>>,
    db.execute(sql`
      SELECT
        to_char(date, 'YYYY-MM') AS year_month,
        SUM(CASE WHEN type = 'income' THEN amount WHEN type = 'expense' THEN -amount ELSE 0 END)::integer AS net_effect
      FROM transactions
      WHERE status = 'applied' AND date >= ${startDate}
      GROUP BY to_char(date, 'YYYY-MM')
      ORDER BY year_month
    `) as unknown as Promise<Array<{ year_month: string; net_effect: number }>>,
  ])

  const totalInitialBalance = balanceRows[0]?.total ?? 0
  const priorEffect = priorRows[0]?.prior_effect ?? 0
  const effectMap = new Map(monthlyRows.map((r) => [r.year_month, r.net_effect]))

  // 누적합으로 요청된 월 범위의 잔액 계산
  let cumulativeBalance = totalInitialBalance + priorEffect
  const points: NetWorthPoint[] = monthList.map((ym) => {
    cumulativeBalance += effectMap.get(ym) ?? 0
    return { yearMonth: ym, totalBalance: cumulativeBalance }
  })

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

function nextMonthStart(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number)
  const nextM = m === 12 ? 1 : m + 1
  const nextY = m === 12 ? y + 1 : y
  return `${nextY}-${String(nextM).padStart(2, '0')}-01`
}
