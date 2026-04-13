import { and, eq, sql, gte } from 'drizzle-orm'
import { getDb } from '@/db/index'
import { transactions, categories, accounts } from '@/db/schema'
import { successResponse } from '@/lib/api-response'
import type {
  ApiResponse,
  MonthlySettlement,
  AnnualSettlement,
  CategorySubtotal,
  AccountChange,
  MonthlyRow,
} from '@/types'

export async function getMonthlySettlement(
  year: number,
  month: number,
): Promise<ApiResponse<MonthlySettlement>> {
  const datePrefix = `${year}-${String(month).padStart(2, '0')}`

  const categoryTotals = await getCategoryTotalsForMonth(datePrefix)
  const incomeByCategory = categoryTotals.filter((c) => c.type === 'income')
  const expenseByCategory = categoryTotals.filter((c) => c.type === 'expense')

  const totalIncome = incomeByCategory.reduce((sum, c) => sum + c.amount, 0)
  const totalExpense = expenseByCategory.reduce((sum, c) => sum + c.amount, 0)
  const netIncome = totalIncome - totalExpense

  const accountChanges = await getAccountChangesForMonth(year, month)

  const previousMonth = await getPreviousMonthTotals(year, month)

  return successResponse({
    year,
    month,
    totalIncome,
    totalExpense,
    netIncome,
    incomeByCategory: incomeByCategory.map(({ type: _, ...rest }) => rest),
    expenseByCategory: expenseByCategory.map(({ type: _, ...rest }) => rest),
    accountChanges,
    previousMonth,
  })
}

export async function getAnnualSettlement(
  year: number,
): Promise<ApiResponse<AnnualSettlement>> {
  const months = await getMonthlyTotalsForYear(year)

  const totalIncome = months.reduce((sum, m) => sum + m.income, 0)
  const totalExpense = months.reduce((sum, m) => sum + m.expense, 0)
  const netIncome = totalIncome - totalExpense

  const yearPrefix = `${year}`
  const categoryTotals = await getCategoryTotalsForYear(yearPrefix)
  const incomeByCategory = categoryTotals.filter((c) => c.type === 'income')
  const expenseByCategory = categoryTotals.filter((c) => c.type === 'expense')

  const previousYear = await getYearTotals(year - 1)

  return successResponse({
    year,
    totalIncome,
    totalExpense,
    netIncome,
    months,
    incomeByCategory: incomeByCategory.map(({ type: _, ...rest }) => rest),
    expenseByCategory: expenseByCategory.map(({ type: _, ...rest }) => rest),
    previousYear,
  })
}

// === Internal Helpers ===

interface CategoryTotalWithType extends CategorySubtotal {
  readonly type: string
}

async function getCategoryTotalsForMonth(datePrefix: string): Promise<CategoryTotalWithType[]> {
  const db = getDb()

  // 소분류→대분류 롤업: COALESCE(parent_id, id)로 대분류 기준 집계
  // parent_categories: 대분류 참조용 셀프조인
  const rows = await db.execute(sql`
    SELECT
      COALESCE(c.parent_id, c.id) AS category_id,
      COALESCE(pc.name, c.name, '미분류') AS category_name,
      t.type,
      SUM(t.amount) AS amount
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN categories pc ON c.parent_id = pc.id
    WHERE t.date LIKE ${datePrefix + '%'}
      AND t.type IN ('income', 'expense')
    GROUP BY COALESCE(c.parent_id, c.id), t.type
  `) as unknown as Array<{ category_id: string | null; category_name: string; type: string; amount: number }>

  return rows.map((row) => ({
    categoryId: row.category_id ?? '',
    categoryName: row.category_name ?? '미분류',
    type: row.type,
    amount: row.amount,
  }))
}

async function getCategoryTotalsForYear(yearPrefix: string): Promise<CategoryTotalWithType[]> {
  const db = getDb()

  const rows = await db.execute(sql`
    SELECT
      COALESCE(c.parent_id, c.id) AS category_id,
      COALESCE(pc.name, c.name, '미분류') AS category_name,
      t.type,
      SUM(t.amount) AS amount
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN categories pc ON c.parent_id = pc.id
    WHERE substr(t.date, 1, 4) = ${yearPrefix}
      AND t.type IN ('income', 'expense')
    GROUP BY COALESCE(c.parent_id, c.id), t.type
  `) as unknown as Array<{ category_id: string | null; category_name: string; type: string; amount: number }>

  return rows.map((row) => ({
    categoryId: row.category_id ?? '',
    categoryName: row.category_name ?? '미분류',
    type: row.type,
    amount: row.amount,
  }))
}

async function getAccountChangesForMonth(year: number, month: number): Promise<AccountChange[]> {
  const db = getDb()
  const datePrefix = `${year}-${String(month).padStart(2, '0')}`
  const monthStart = `${datePrefix}-01`

  const allAccounts = await db.select().from(accounts)

  const results: AccountChange[] = []
  for (const account of allAccounts) {
    // 해당 월 이후 모든 거래 효과를 합산하여 기초잔액 역산
    const effectsFromMonth = await getAccountEffectsFrom(account.id, monthStart)
    const openingBalance = account.currentBalance - effectsFromMonth

    // 해당 월 거래만 집계
    const monthEffects = await getAccountMonthEffects(account.id, datePrefix)

    const closingBalance = openingBalance + monthEffects.income - monthEffects.expense

    results.push({
      accountId: account.id,
      accountName: account.name,
      openingBalance,
      income: monthEffects.income,
      expense: monthEffects.expense,
      closingBalance,
    })
  }

  return results
}

async function getAccountEffectsFrom(accountId: string, fromDate: string): Promise<number> {
  const db = getDb()

  // income to this account (from fromDate onwards)
  const incomeRows = await db
    .select({ total: sql<number>`coalesce(sum(${transactions.amount}), 0)`.as('total') })
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, accountId),
        eq(transactions.type, 'income'),
        gte(transactions.date, fromDate),
      ),
    )

  // expense from this account
  const expenseRows = await db
    .select({ total: sql<number>`coalesce(sum(${transactions.amount}), 0)`.as('total') })
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, accountId),
        eq(transactions.type, 'expense'),
        gte(transactions.date, fromDate),
      ),
    )

  // transfer out from this account
  const transferOutRows = await db
    .select({ total: sql<number>`coalesce(sum(${transactions.amount}), 0)`.as('total') })
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, accountId),
        eq(transactions.type, 'transfer'),
        gte(transactions.date, fromDate),
      ),
    )

  // transfer in to this account
  const transferInRows = await db
    .select({ total: sql<number>`coalesce(sum(${transactions.amount}), 0)`.as('total') })
    .from(transactions)
    .where(
      and(
        eq(transactions.toAccountId, accountId),
        eq(transactions.type, 'transfer'),
        gte(transactions.date, fromDate),
      ),
    )

  const income = incomeRows[0]?.total ?? 0
  const expense = expenseRows[0]?.total ?? 0
  const transferOut = transferOutRows[0]?.total ?? 0
  const transferIn = transferInRows[0]?.total ?? 0

  return income - expense - transferOut + transferIn
}

async function getAccountMonthEffects(
  accountId: string,
  datePrefix: string,
): Promise<{ income: number; expense: number }> {
  const db = getDb()

  // 이 계좌의 수입 (income + transfer in)
  const incomeRows = await db
    .select({ total: sql<number>`coalesce(sum(${transactions.amount}), 0)`.as('total') })
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, accountId),
        eq(transactions.type, 'income'),
        sql`${transactions.date} like ${datePrefix + '%'}`,
      ),
    )

  const transferInRows = await db
    .select({ total: sql<number>`coalesce(sum(${transactions.amount}), 0)`.as('total') })
    .from(transactions)
    .where(
      and(
        eq(transactions.toAccountId, accountId),
        eq(transactions.type, 'transfer'),
        sql`${transactions.date} like ${datePrefix + '%'}`,
      ),
    )

  // 이 계좌의 지출 (expense + transfer out)
  const expenseRows = await db
    .select({ total: sql<number>`coalesce(sum(${transactions.amount}), 0)`.as('total') })
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, accountId),
        eq(transactions.type, 'expense'),
        sql`${transactions.date} like ${datePrefix + '%'}`,
      ),
    )

  const transferOutRows = await db
    .select({ total: sql<number>`coalesce(sum(${transactions.amount}), 0)`.as('total') })
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, accountId),
        eq(transactions.type, 'transfer'),
        sql`${transactions.date} like ${datePrefix + '%'}`,
      ),
    )

  return {
    income: (incomeRows[0]?.total ?? 0) + (transferInRows[0]?.total ?? 0),
    expense: (expenseRows[0]?.total ?? 0) + (transferOutRows[0]?.total ?? 0),
  }
}

async function getPreviousMonthTotals(
  year: number,
  month: number,
): Promise<{ totalIncome: number; totalExpense: number; netIncome: number } | null> {
  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year
  const datePrefix = `${prevYear}-${String(prevMonth).padStart(2, '0')}`

  return getMonthTotals(datePrefix)
}

async function getMonthTotals(
  datePrefix: string,
): Promise<{ totalIncome: number; totalExpense: number; netIncome: number } | null> {
  const db = getDb()

  const rows = await db
    .select({
      type: transactions.type,
      total: sql<number>`sum(${transactions.amount})`.as('total'),
    })
    .from(transactions)
    .where(
      and(
        sql`${transactions.date} like ${datePrefix + '%'}`,
        sql`${transactions.type} in ('income', 'expense')`,
      ),
    )
    .groupBy(transactions.type)

  if (rows.length === 0) return null

  let totalIncome = 0
  let totalExpense = 0
  for (const row of rows) {
    if (row.type === 'income') totalIncome = row.total
    else if (row.type === 'expense') totalExpense = row.total
  }

  return { totalIncome, totalExpense, netIncome: totalIncome - totalExpense }
}

async function getMonthlyTotalsForYear(year: number): Promise<MonthlyRow[]> {
  const db = getDb()

  const rows = await db
    .select({
      month: sql<number>`cast(substr(${transactions.date}, 6, 2) as integer)`.as('month'),
      type: transactions.type,
      total: sql<number>`sum(${transactions.amount})`.as('total'),
    })
    .from(transactions)
    .where(
      and(
        sql`substr(${transactions.date}, 1, 4) = ${String(year)}`,
        sql`${transactions.type} in ('income', 'expense')`,
      ),
    )
    .groupBy(sql`substr(${transactions.date}, 6, 2)`, transactions.type)

  const monthMap = new Map<number, { income: number; expense: number }>()
  for (const row of rows) {
    const existing = monthMap.get(row.month) ?? { income: 0, expense: 0 }
    if (row.type === 'income') existing.income = row.total
    else if (row.type === 'expense') existing.expense = row.total
    monthMap.set(row.month, existing)
  }

  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1
    const data = monthMap.get(month) ?? { income: 0, expense: 0 }
    return {
      month,
      income: data.income,
      expense: data.expense,
      netIncome: data.income - data.expense,
    }
  })
}

async function getYearTotals(
  year: number,
): Promise<{ totalIncome: number; totalExpense: number; netIncome: number } | null> {
  const db = getDb()

  const rows = await db
    .select({
      type: transactions.type,
      total: sql<number>`sum(${transactions.amount})`.as('total'),
    })
    .from(transactions)
    .where(
      and(
        sql`substr(${transactions.date}, 1, 4) = ${String(year)}`,
        sql`${transactions.type} in ('income', 'expense')`,
      ),
    )
    .groupBy(transactions.type)

  if (rows.length === 0) return null

  let totalIncome = 0
  let totalExpense = 0
  for (const row of rows) {
    if (row.type === 'income') totalIncome = row.total
    else if (row.type === 'expense') totalExpense = row.total
  }

  return { totalIncome, totalExpense, netIncome: totalIncome - totalExpense }
}
