import { getDb } from '@/db/index'
import { transactions } from '@/db/schema'
import { sql, and, gte, lt, eq } from 'drizzle-orm'
import { successResponse } from '@/lib/api-response'
import type { ApiResponse } from '@/types'

export interface DailyTotal {
  readonly date: string
  readonly income: number
  readonly expense: number
}

export async function getDailyTotals(
  year: number,
  month: number,
): Promise<ApiResponse<readonly DailyTotal[]>> {
  const db = getDb()
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const to = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`

  const rows = await db.execute(sql`
    SELECT
      ${transactions.date}::text AS date,
      COALESCE(SUM(CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amount} END), 0)::integer AS income,
      COALESCE(SUM(CASE WHEN ${transactions.type} = 'expense' THEN ${transactions.amount} END), 0)::integer AS expense
    FROM ${transactions}
    WHERE ${transactions.status} = 'applied'
      AND ${transactions.date} >= ${from}
      AND ${transactions.date} < ${to}
    GROUP BY ${transactions.date}
    ORDER BY ${transactions.date}
  `) as unknown as Array<{ date: string; income: number; expense: number }>

  return successResponse(
    rows.map(r => ({ date: r.date, income: r.income, expense: r.expense })),
  )
}
