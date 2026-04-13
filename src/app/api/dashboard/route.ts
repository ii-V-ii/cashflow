import { findAllAccounts } from '@/db/repositories'
import { findAllTransactions } from '@/db/repositories'
import { successResponse } from '@/lib/api-response'

export async function GET() {
  const accounts = await findAllAccounts()
  const totalBalance = accounts.reduce((sum, acc) => sum + acc.currentBalance, 0)

  const now = new Date()
  const year = now.getFullYear()
  const m = now.getMonth() + 1
  const monthStart = `${year}-${String(m).padStart(2, '0')}-01`
  const nextM = m === 12 ? 1 : m + 1
  const nextY = m === 12 ? year + 1 : year
  const monthEnd = `${nextY}-${String(nextM).padStart(2, '0')}-01`

  const { data: monthlyTransactions } = await findAllTransactions(
    { dateRange: { from: monthStart, to: monthEnd } },
    { limit: 1000 },
  )

  const monthlyIncome = monthlyTransactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0)

  const monthlyExpense = monthlyTransactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0)

  const { data: recentTransactions } = await findAllTransactions(undefined, { limit: 5 })

  return Response.json(
    successResponse({
      totalBalance,
      monthlyIncome,
      monthlyExpense,
      monthlyNet: monthlyIncome - monthlyExpense,
      accountCount: accounts.length,
      recentTransactions,
    }),
  )
}
