import { and, sql, gte, lt } from 'drizzle-orm'
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
  ExpenseKind,
} from '@/types'

export async function getMonthlySettlement(
  year: number,
  month: number,
): Promise<ApiResponse<MonthlySettlement>> {
  const { start, end } = monthDateRange(year, month)

  const categoryTotals = await getCategoryTotalsForMonth(start, end)
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
    incomeByCategory: incomeByCategory.map(({ type: _, expenseKind: _ek, ...rest }) => rest),
    expenseByCategory: expenseByCategory.map(({ type: _, ...rest }) => ({
      categoryId: rest.categoryId,
      categoryName: rest.categoryName,
      amount: rest.amount,
      expenseKind: rest.expenseKind,
    })),
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

  const yearStart = `${year}-01-01`
  const yearEnd = `${year + 1}-01-01`
  const categoryTotals = await getCategoryTotalsForYear(yearStart, yearEnd)
  const incomeByCategory = categoryTotals.filter((c) => c.type === 'income')
  const expenseByCategory = categoryTotals.filter((c) => c.type === 'expense')

  const previousYear = await getYearTotals(year - 1)

  return successResponse({
    year,
    totalIncome,
    totalExpense,
    netIncome,
    months,
    incomeByCategory: incomeByCategory.map(({ type: _, expenseKind: _ek, ...rest }) => rest),
    expenseByCategory: expenseByCategory.map(({ type: _, ...rest }) => ({
      categoryId: rest.categoryId,
      categoryName: rest.categoryName,
      amount: rest.amount,
      expenseKind: rest.expenseKind,
    })),
    previousYear,
  })
}

// === Internal Helpers ===

interface CategoryTotalWithType extends CategorySubtotal {
  readonly type: string
  readonly expenseKind: ExpenseKind | null
}

// M-2: SUM()::integer, 날짜: 범위 쿼리
async function getCategoryTotalsForMonth(start: string, end: string): Promise<CategoryTotalWithType[]> {
  const db = getDb()

  const rows = await db.execute(sql`
    SELECT
      COALESCE(c.parent_id, c.id) AS category_id,
      COALESCE(pc.name, c.name, '미분류') AS category_name,
      t.type,
      COALESCE(pc.expense_kind, c.expense_kind) AS expense_kind,
      SUM(t.amount)::integer AS amount
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN categories pc ON c.parent_id = pc.id
    WHERE t.date >= ${start} AND t.date < ${end}
      AND t.type IN ('income', 'expense')
    GROUP BY COALESCE(c.parent_id, c.id), COALESCE(pc.name, c.name, '미분류'), t.type, COALESCE(pc.expense_kind, c.expense_kind)
  `) as unknown as Array<{ category_id: string | null; category_name: string; type: string; expense_kind: string | null; amount: number }>

  return rows.map((row) => ({
    categoryId: row.category_id ?? '',
    categoryName: row.category_name ?? '미분류',
    type: row.type,
    expenseKind: row.expense_kind as ExpenseKind | null,
    amount: row.amount,
  }))
}

async function getCategoryTotalsForYear(yearStart: string, yearEnd: string): Promise<CategoryTotalWithType[]> {
  const db = getDb()

  const rows = await db.execute(sql`
    SELECT
      COALESCE(c.parent_id, c.id) AS category_id,
      COALESCE(pc.name, c.name, '미분류') AS category_name,
      t.type,
      COALESCE(pc.expense_kind, c.expense_kind) AS expense_kind,
      SUM(t.amount)::integer AS amount
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN categories pc ON c.parent_id = pc.id
    WHERE t.date >= ${yearStart} AND t.date < ${yearEnd}
      AND t.type IN ('income', 'expense')
    GROUP BY COALESCE(c.parent_id, c.id), COALESCE(pc.name, c.name, '미분류'), t.type, COALESCE(pc.expense_kind, c.expense_kind)
  `) as unknown as Array<{ category_id: string | null; category_name: string; type: string; expense_kind: string | null; amount: number }>

  return rows.map((row) => ({
    categoryId: row.category_id ?? '',
    categoryName: row.category_name ?? '미분류',
    type: row.type,
    expenseKind: row.expense_kind as ExpenseKind | null,
    amount: row.amount,
  }))
}

// H-7 + H-2: 기초잔액 순방향 계산 + 계좌별 N쿼리 → 단일 SQL 2개
async function getAccountChangesForMonth(year: number, month: number): Promise<AccountChange[]> {
  const db = getDb()
  const { start, end } = monthDateRange(year, month)

  const allAccounts = await db.select().from(accounts)

  // 월 시작 전까지의 누적 효과 (기초잔액 = initialBalance + pre-month net effect)
  const preMonthEffects = await db.execute(sql`
    SELECT
      e.account_id,
      COALESCE(SUM(e.effect)::integer, 0) AS net_effect
    FROM (
      SELECT account_id,
        CASE
          WHEN type = 'income' THEN amount
          WHEN type = 'expense' THEN -amount
          WHEN type = 'transfer' THEN -amount
        END AS effect
      FROM transactions WHERE date < ${start} AND recurring_id IS NULL
      UNION ALL
      SELECT to_account_id AS account_id, amount AS effect
      FROM transactions WHERE date < ${start} AND recurring_id IS NULL
        AND type IN ('transfer', 'expense') AND to_account_id IS NOT NULL
    ) e
    GROUP BY e.account_id
  `) as unknown as Array<{ account_id: string; net_effect: number }>

  // 해당 월 수입/지출 집계 (transfer/저축성지출 포함: in→수입, out→지출)
  const monthEffects = await db.execute(sql`
    SELECT
      e.account_id,
      SUM(CASE WHEN e.effect_type = 'income' THEN e.amount ELSE 0 END)::integer AS income,
      SUM(CASE WHEN e.effect_type = 'expense' THEN e.amount ELSE 0 END)::integer AS expense
    FROM (
      SELECT account_id, 'income' AS effect_type, amount
      FROM transactions WHERE date >= ${start} AND date < ${end}
        AND recurring_id IS NULL AND type = 'income'
      UNION ALL
      SELECT to_account_id AS account_id, 'income' AS effect_type, amount
      FROM transactions WHERE date >= ${start} AND date < ${end}
        AND recurring_id IS NULL AND type IN ('transfer', 'expense') AND to_account_id IS NOT NULL
      UNION ALL
      SELECT account_id, 'expense' AS effect_type, amount
      FROM transactions WHERE date >= ${start} AND date < ${end}
        AND recurring_id IS NULL AND type IN ('expense', 'transfer')
    ) e
    GROUP BY e.account_id
  `) as unknown as Array<{ account_id: string; income: number; expense: number }>

  const preEffectMap = new Map(preMonthEffects.map((r) => [r.account_id, r.net_effect]))
  const monthEffectMap = new Map(monthEffects.map((r) => [r.account_id, { income: r.income, expense: r.expense }]))

  return allAccounts.map((account) => {
    const preEffect = preEffectMap.get(account.id) ?? 0
    const openingBalance = account.initialBalance + preEffect
    const effects = monthEffectMap.get(account.id) ?? { income: 0, expense: 0 }
    const closingBalance = openingBalance + effects.income - effects.expense

    return {
      accountId: account.id,
      accountName: account.name,
      openingBalance,
      income: effects.income,
      expense: effects.expense,
      closingBalance,
    }
  })
}

async function getPreviousMonthTotals(
  year: number,
  month: number,
): Promise<{ totalIncome: number; totalExpense: number; netIncome: number } | null> {
  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year
  const { start, end } = monthDateRange(prevYear, prevMonth)

  return getMonthTotals(start, end)
}

// M-2: SUM()::integer, 날짜: 범위 쿼리
async function getMonthTotals(
  start: string,
  end: string,
): Promise<{ totalIncome: number; totalExpense: number; netIncome: number } | null> {
  const db = getDb()

  const rows = await db
    .select({
      type: transactions.type,
      total: sql<number>`sum(${transactions.amount})::integer`.as('total'),
    })
    .from(transactions)
    .where(
      and(
        gte(transactions.date, start),
        lt(transactions.date, end),
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
  const yearStart = `${year}-01-01`
  const yearEnd = `${year + 1}-01-01`

  // M-2: SUM()::integer, 날짜: EXTRACT + 범위 쿼리
  const rows = await db
    .select({
      month: sql<number>`EXTRACT(MONTH FROM ${transactions.date})::integer`.as('month'),
      type: transactions.type,
      total: sql<number>`sum(${transactions.amount})::integer`.as('total'),
    })
    .from(transactions)
    .where(
      and(
        gte(transactions.date, yearStart),
        lt(transactions.date, yearEnd),
        sql`${transactions.type} in ('income', 'expense')`,
      ),
    )
    .groupBy(sql`EXTRACT(MONTH FROM ${transactions.date})`, transactions.type)

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
  const yearStart = `${year}-01-01`
  const yearEnd = `${year + 1}-01-01`

  // M-2: SUM()::integer, 날짜: 범위 쿼리
  const rows = await db
    .select({
      type: transactions.type,
      total: sql<number>`sum(${transactions.amount})::integer`.as('total'),
    })
    .from(transactions)
    .where(
      and(
        gte(transactions.date, yearStart),
        lt(transactions.date, yearEnd),
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

// === Date Helpers ===

function monthDateRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const end = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
  return { start, end }
}
