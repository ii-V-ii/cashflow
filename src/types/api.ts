import type {
  AccountType,
  ExpenseKind,
  TransactionStatus,
  TransactionType,
} from "@/types"

/** API DTO — docs/API.md 응답 스키마와 1:1 (서버·클라이언트 공유) */

export interface TagDto {
  id: string
  name: string
  color: string | null
}

export interface TransactionCategoryRef {
  id: string
  name: string
  icon: string | null
  color: string | null
  expenseKind: ExpenseKind | null
}

export interface TransactionAccountRef {
  id: string
  name: string
  type: AccountType
}

export interface TransactionDto {
  id: string
  type: TransactionType
  amount: number
  description: string
  date: string
  categoryId: string | null
  category: TransactionCategoryRef | null
  accountId: string
  account: TransactionAccountRef
  toAccountId: string | null
  toAccount: TransactionAccountRef | null
  memo: string | null
  tags: TagDto[]
  installmentMonths: number | null
  installmentCurrent: number | null
  status: TransactionStatus
  recurringId: string | null
  createdAt: string
  updatedAt: string
}

export interface AccountDto {
  id: string
  name: string
  type: AccountType
  balance: number
  initialBalance: number
  color: string | null
  icon: string | null
  sortOrder: number
  isActive: boolean
  depositType: "lump_sum" | "installment" | null
  termMonths: number | null
  interestRate: number | null
  taxType: "normal" | "preferential" | "tax_free" | "high" | null
  openDate: string | null
  monthlyPayment: number | null
  billingDay: number | null
  creditLimit: number | null
  linkedAccountId: string | null
  assetId: string | null
  createdAt: string
  updatedAt: string
}

export interface CategoryDto {
  id: string
  name: string
  type: "income" | "expense"
  expenseKind: ExpenseKind | null
  icon: string | null
  color: string | null
  parentId: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type CategoryTreeDto = CategoryDto & { children: CategoryDto[] }

export interface PageDto<T> {
  items: T[]
  total: number
  page: number
  limit: number
}

/** ── 결산 (API.md §7) ─────────────────────────────────────── */

export interface SettlementCategoryDto {
  categoryId: string | null
  name: string
  amount: number
  /** 해당 유형 합계 대비 백분율 (0~100) */
  ratio: number
}

export type SettlementExpenseCategoryDto = SettlementCategoryDto & {
  expenseKind: ExpenseKind | null
}

export interface SettlementAccountChangeDto {
  accountId: string
  name: string
  openingBalance: number
  closingBalance: number
  change: number
}

export interface MonthlySettlementDto {
  year: number
  month: number
  income: { total: number; byCategory: SettlementCategoryDto[] }
  expense: {
    total: number
    byCategory: SettlementExpenseCategoryDto[]
    consumptionTotal: number
    savingTotal: number
  }
  net: number
  accounts: SettlementAccountChangeDto[]
  momComparison: { incomeDiff: number; expenseDiff: number; netDiff: number }
}

export interface AnnualSettlementMonthDto {
  month: number
  income: number
  expense: number
  saving: number
  net: number
}

export interface AnnualSettlementCategoryDto {
  categoryId: string | null
  name: string
  type: "income" | "expense"
  expenseKind: ExpenseKind | null
  amount: number
  ratio: number
}

export interface AnnualSettlementDto {
  year: number
  months: AnnualSettlementMonthDto[]
  byCategory: AnnualSettlementCategoryDto[]
  total: { income: number; expense: number; saving: number; net: number }
}

/** ── 대시보드 (API.md §8.1) ───────────────────────────────── */

export interface DailyTotalDto {
  date: string
  income: number
  expense: number
}

export interface DashboardDto {
  netWorth: number
  totalBalance: number
  accountCount: number
  /** 투자 트랙(monthly_investment_summary_v) 랜딩 전까지 null placeholder */
  investment: { totalValue: number; totalGain: number; gainRate: number } | null
  monthlyIncome: number
  monthlyExpense: number
  dailyTotals: DailyTotalDto[]
  /** 예산 트랙(budget_totals_v) 랜딩 전까지 null placeholder */
  budget: { plannedTotal: number; actualTotal: number; ratio: number } | null
  recentTransactions: TransactionDto[]
}

/** ── 보고서 (API.md §14) ──────────────────────────────────── */

export interface TrendPointDto {
  ym: string
  income: number
  expense: number
  saving: number
  net: number
}

export interface TrendReportDto {
  months: TrendPointDto[]
}

export interface CategoryReportItemDto {
  categoryId: string | null
  name: string
  color: string | null
  amount: number
  ratio: number
}

export interface CategoryReportDto {
  total: number
  byCategory: CategoryReportItemDto[]
}

export interface NetWorthPointDto {
  date: string
  accountTotal: number
  assetTotal: number
  netWorth: number
}

export interface NetWorthReportDto {
  points: NetWorthPointDto[]
}
