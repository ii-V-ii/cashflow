import { findAllAccounts, findAllTransactions } from '@/db/repositories'
import { getDb } from '@/db/index'
import { transactions } from '@/db/schema'
import { sql, and, gte, lt } from 'drizzle-orm'
import { successResponse } from '@/lib/api-response'

export async function GET() {
  const now = new Date()
  const year = now.getFullYear()
  const m = now.getMonth() + 1
  const monthStart = `${year}-${String(m).padStart(2, '0')}-01`
  const nextM = m === 12 ? 1 : m + 1
  const nextY = m === 12 ? year + 1 : year
  const monthEnd = `${nextY}-${String(nextM).padStart(2, '0')}-01`

  const db = getDb()

  // DB SUM 집계 + Promise.all 병렬 실행
  const [accounts, monthlySums, { data: recentTransactions }] = await Promise.all([
    findAllAccounts(),
    db
      .select({
        type: transactions.type,
        total: sql<number>`coalesce(sum(${transactions.amount}), 0)::integer`.as('total'),
      })
      .from(transactions)
      .where(
        and(
          gte(transactions.date, monthStart),
          lt(transactions.date, monthEnd),
          sql`${transactions.type} in ('income', 'expense')`,
        ),
      )
      .groupBy(transactions.type),
    findAllTransactions(undefined, { limit: 5 }),
  ])

  const totalBalance = accounts.reduce((sum, acc) => sum + acc.currentBalance, 0)

  let monthlyIncome = 0
  let monthlyExpense = 0
  for (const row of monthlySums) {
    if (row.type === 'income') monthlyIncome = row.total
    else if (row.type === 'expense') monthlyExpense = row.total
  }

  return Response.json(
    successResponse({
      totalBalance,
      monthlyIncome,
      monthlyExpense,
      monthlyNet: monthlyIncome - monthlyExpense,
      accountCount: accounts.length,
      recentTransactions,
    }),
    { headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' } },
  )
}
