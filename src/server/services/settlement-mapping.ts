import type { ExpenseKind } from "@/types"
import type {
  AnnualSettlementDto,
  MonthlySettlementDto,
  SettlementCategoryDto,
  SettlementExpenseCategoryDto,
} from "@/types/api"

/**
 * get_monthly_settlement RPC(DB.md §3.10) / 연간 집계 SQL 원형 → API.md §7 DTO 매핑.
 * 순수 함수 — DB 접근 없음 (단위 테스트 대상).
 */

export interface RawSettlementCategory {
  category_id: string | null
  category_name: string
  amount: number
}

export type RawSettlementExpenseCategory = RawSettlementCategory & {
  expense_kind: ExpenseKind | null
}

export interface RawAccountChange {
  account_id: string
  name: string
  opening_balance: number
  income: number
  expense: number
  closing_balance: number
}

export interface RawMonthlySettlement {
  year: number
  month: number
  total_income: number
  total_expense: number
  net_income: number
  income_by_category: RawSettlementCategory[] | null
  expense_by_category: RawSettlementExpenseCategory[] | null
  account_changes: RawAccountChange[] | null
  previous_month: { income: number; expense: number; net: number }
}

/** 구성비 백분율(0~100, 소수 1자리) — 합계 0이면 0 */
export function toRatio(amount: number, total: number): number {
  if (total === 0) return 0
  return Math.round((amount / total) * 1000) / 10
}

function mapCategory(
  raw: RawSettlementCategory,
  total: number,
): SettlementCategoryDto {
  return {
    categoryId: raw.category_id,
    name: raw.category_name,
    amount: raw.amount,
    ratio: toRatio(raw.amount, total),
  }
}

export function mapMonthlySettlement(
  raw: RawMonthlySettlement,
): MonthlySettlementDto {
  const incomeByCategory = raw.income_by_category ?? []
  const expenseByCategory = raw.expense_by_category ?? []
  const accountChanges = raw.account_changes ?? []

  const expenseCategories: SettlementExpenseCategoryDto[] = expenseByCategory.map(
    (item) => ({
      ...mapCategory(item, raw.total_expense),
      expenseKind: item.expense_kind,
    }),
  )
  const savingTotal = expenseByCategory
    .filter((item) => item.expense_kind === "saving")
    .reduce((sum, item) => sum + item.amount, 0)

  return {
    year: raw.year,
    month: raw.month,
    income: {
      total: raw.total_income,
      byCategory: incomeByCategory.map((item) =>
        mapCategory(item, raw.total_income),
      ),
    },
    expense: {
      total: raw.total_expense,
      byCategory: expenseCategories,
      consumptionTotal: raw.total_expense - savingTotal,
      savingTotal,
    },
    net: raw.net_income,
    accounts: accountChanges.map((item) => ({
      accountId: item.account_id,
      name: item.name,
      openingBalance: item.opening_balance,
      closingBalance: item.closing_balance,
      change: item.closing_balance - item.opening_balance,
    })),
    momComparison: {
      incomeDiff: raw.total_income - raw.previous_month.income,
      expenseDiff: raw.total_expense - raw.previous_month.expense,
      netDiff: raw.net_income - raw.previous_month.net,
    },
  }
}

export interface RawAnnualMonth {
  month: number
  income: number
  expense: number
  saving: number
}

export interface RawAnnualCategory {
  category_id: string | null
  category_name: string
  type: "income" | "expense"
  expense_kind: ExpenseKind | null
  amount: number
}

export interface RawAnnualSettlement {
  year: number
  months: RawAnnualMonth[] | null
  by_category: RawAnnualCategory[] | null
}

const MONTHS_PER_YEAR = 12

export function mapAnnualSettlement(raw: RawAnnualSettlement): AnnualSettlementDto {
  const byMonth = new Map((raw.months ?? []).map((m) => [m.month, m]))
  const months = Array.from({ length: MONTHS_PER_YEAR }, (_, index) => {
    const source = byMonth.get(index + 1)
    const income = source?.income ?? 0
    const expense = source?.expense ?? 0
    return {
      month: index + 1,
      income,
      expense,
      saving: source?.saving ?? 0,
      net: income - expense,
    }
  })

  const total = months.reduce(
    (acc, m) => ({
      income: acc.income + m.income,
      expense: acc.expense + m.expense,
      saving: acc.saving + m.saving,
      net: acc.net + m.net,
    }),
    { income: 0, expense: 0, saving: 0, net: 0 },
  )

  const byCategory = (raw.by_category ?? []).map((item) => ({
    categoryId: item.category_id,
    name: item.category_name,
    type: item.type,
    expenseKind: item.expense_kind,
    amount: item.amount,
    ratio: toRatio(item.amount, item.type === "income" ? total.income : total.expense),
  }))

  return { year: raw.year, months, byCategory, total }
}
