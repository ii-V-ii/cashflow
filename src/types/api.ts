import type {
  AccountType,
  ExpenseKind,
  RecurringFrequency,
  ForecastAssumptions,
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

/** Recurring DTO (API.md §12.1) — recurring_json과 1:1 */
export interface RecurringDto {
  id: string
  type: TransactionType
  amount: number
  description: string
  categoryId: string | null
  accountId: string
  toAccountId: string | null
  frequency: RecurringFrequency
  interval: number
  startDate: string
  endDate: string | null
  nextDate: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

/** POST /recurring/process 응답 (API.md §12.6) */
export interface RecurringProcessResultDto {
  processed: number
  generatedThrough: string
}

export interface PageDto<T> {
  items: T[]
  total: number
  page: number
  limit: number
}

/** GET /budgets 목록 행 (API.md §6.1) — plannedTotal = 지출 계획 합(budget_totals_v.total_expense) */
export interface BudgetSummaryItemDto {
  id: string
  name: string
  year: number
  month: number | null
  itemCount: number
  plannedTotal: number
}

export interface BudgetItemCategoryRef {
  id: string
  name: string
  type: "income" | "expense"
  icon: string | null
  color: string | null
  expenseKind: ExpenseKind | null
  parentId: string | null
}

export interface BudgetItemDto {
  id: string
  categoryId: string
  category: BudgetItemCategoryRef
  plannedAmount: number
  memo: string | null
}

/** 예산 쓰기 응답 (API.md §6.2/6.4/6.6) */
export interface BudgetDto {
  id: string
  name: string
  year: number
  month: number | null
  memo: string | null
  items: BudgetItemDto[]
}

// ─── Phase 2C: 자산·투자 (API.md §9-11) ────────────────────

export interface AssetCategoryDto {
  id: string
  name: string
  kind: "financial" | "non_financial"
  icon: string | null
  color: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

/** GET /budgets/{id} 상세 항목 — 계획 + 실적 (API.md §6.3) */
export type BudgetDetailItemDto = BudgetItemDto & { actualAmount: number }

export interface BudgetDetailDto {
  id: string
  name: string
  year: number
  month: number | null
  memo: string | null
  items: BudgetDetailItemDto[]
  plannedTotal: number
  actualTotal: number
}

/** GET /budgets/actuals 행 (API.md §6.7) — 가상 항목(예산 없는 실적) 포함 */
export interface BudgetActualCategoryDto {
  categoryId: string | null
  categoryName: string
  type: "income" | "expense"
  expenseKind: ExpenseKind | null
  planned: number
  actual: number
  ratio: number | null
}

export interface BudgetActualsDto {
  budgetId: string | null
  year: number
  month: number
  categories: BudgetActualCategoryDto[]
  plannedTotal: number
  actualTotal: number
}

/** GET /budgets/annual-grid 행 (API.md §6.8) — 대분류 그룹 단위 */
export interface AnnualGridRowDto {
  categoryId: string
  categoryName: string
  type: "income" | "expense"
  expenseKind: ExpenseKind | null
  /** 그룹 내 개별 카테고리(소분류 포함) 월별 계획 — 인라인 편집 대상 */
  categories: {
    categoryId: string
    categoryName: string
    parentId: string | null
    months: number[]
    total: number
  }[]
  months: number[]
  total: number
}

export interface AnnualGridDto {
  rows: AnnualGridRowDto[]
  monthTotals: number[]
  grandTotal: number
}

/** PUT /budgets/annual-grid/cell 응답 (API.md §6.9) — amount 0 = 항목 삭제(itemId null) */
export interface AnnualGridCellResultDto {
  budgetId: string
  itemId: string | null
  amount: number
}

/** GET /budgets/summary 월 행 (API.md §6.10) */
export interface BudgetSummaryMonthDto {
  month: number
  plannedIncome: number
  plannedExpense: number
  actualIncome: number
  actualExpense: number
}

export interface BudgetYearSummaryDto {
  months: BudgetSummaryMonthDto[]
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

export interface AssetCategoryRef {
  id: string
  name: string
  kind: "financial" | "non_financial"
  icon: string | null
  color: string | null
}

export interface AssetDto {
  id: string
  name: string
  assetCategoryId: string
  assetCategory: AssetCategoryRef
  acquisitionDate: string
  acquisitionCost: number
  /** asset_values_v 파생 (읽기 전용) */
  currentValue: number
  gain: number
  gainRate: number
  institution: string | null
  memo: string | null
  isActive: boolean
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface ValuationDto {
  id: string
  date: string
  value: number
  source: "manual" | "api" | "estimate" | "auto"
  memo: string | null
}

export interface LinkedAccountRef {
  id: string
  name: string
  type: AccountType
  balance: number
}

export type AssetDetailDto = AssetDto & {
  valuations: ValuationDto[]
  linkedAccounts: LinkedAccountRef[]
}

export interface PortfolioDto {
  total: number
  byCategory: {
    assetCategoryId: string
    name: string
    kind: "financial" | "non_financial"
    color: string | null
    value: number
    ratio: number
  }[]
}

export type TradeType = "buy" | "sell" | "dividend"

export interface TradeDto {
  id: string
  assetId: string
  asset: { id: string; name: string }
  tradeType: TradeType
  date: string
  ticker: string | null
  quantity: number
  unitPrice: number
  totalAmount: number
  fee: number
  tax: number
  netAmount: number
  /** buy만 (FIFO 로트 잔량) */
  remainingQuantity: number | null
  /** sell만 (FIFO 계산 결과) */
  realizedGain: number | null
  memo: string | null
  accountId: string | null
  createdAt: string
  updatedAt: string
}

export interface TradeSummaryDto {
  totalBuy: number
  totalSell: number
  realizedGain: number
  dividendIncome: number
  feeTotal: number
  taxTotal: number
  netProfit: number
  returnRate: number
}

export interface TickerRowDto {
  ticker: string | null
  name: string
  quantity: number
  avgBuyPrice: number
  totalBuyAmount: number
  totalSellAmount: number
  dividendIncome: number
  realizedGain: number
  returnRate: number
  trades: TradeDto[]
}

export interface TickerBreakdownDto {
  holding: TickerRowDto[]
  closed: TickerRowDto[]
}

export interface AnnualMonthDto {
  month: number
  investedAmount: number
  dividendIncome: number
  realizedGain: number
  returnRate: number
}

export interface AnnualSummaryDto {
  months: AnnualMonthDto[]
  total: Omit<AnnualMonthDto, "month">
}

/** 예측 시나리오 (API.md §13.1) */
export interface ForecastScenarioDto {
  id: string
  name: string
  description: string | null
  assumptions: ForecastAssumptions | null
  startDate: string
  endDate: string
}

/** PATCH 응답 — 수정 시 기존 결과 무효 플래그 (API.md §13.4) */
export type UpdatedForecastScenarioDto = ForecastScenarioDto & {
  staleResults: true
}

/**
 * 예측 결과 1개월 (API.md §13.6).
 * projectedCashflow = 누적 현금(DB projected_balance).
 * goalProgress: 목표 금액은 서버에 저장하지 않으므로 항상 null —
 * UI가 입력값과 findGoalReachYm으로 클라이언트에서 계산한다 (PRD §3.9).
 */
export interface ForecastResultDto {
  ym: string
  projectedIncome: number
  projectedExpense: number
  projectedCashflow: number
  projectedNetWorth: number
  goalProgress: number | null
}

export interface RunForecastResponseDto {
  scenarioId: string
  results: ForecastResultDto[]
}
