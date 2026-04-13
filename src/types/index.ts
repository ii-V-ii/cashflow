// === Transaction ===

export type TransactionType = 'income' | 'expense' | 'transfer'

export interface Transaction {
  readonly id: string
  readonly type: TransactionType
  readonly amount: number // KRW 정수
  readonly description: string
  readonly categoryId: string | null
  readonly accountId: string
  readonly toAccountId: string | null // transfer 전용
  readonly date: string // YYYY-MM-DD
  readonly memo: string | null
  readonly tags: readonly string[]
  readonly createdAt: string
  readonly updatedAt: string
}

// === Account ===

export type AccountType = 'cash' | 'bank' | 'card' | 'savings' | 'investment'

export interface Account {
  readonly id: string
  readonly name: string
  readonly type: AccountType
  readonly currentBalance: number // KRW 정수
  readonly color: string | null
  readonly icon: string | null
  readonly isActive: boolean
  readonly sortOrder: number
  readonly createdAt: string
  readonly updatedAt: string
}

// === Category ===

export type CategoryType = 'income' | 'expense'

export interface Category {
  readonly id: string
  readonly name: string
  readonly type: CategoryType
  readonly icon: string | null
  readonly color: string | null
  readonly parentId: string | null
  readonly sortOrder: number
  readonly isActive: boolean
  readonly createdAt: string
  readonly updatedAt: string
}

// === Category (Grouped) ===

export interface CategoryWithChildren extends Category {
  readonly children: readonly Category[]
}

// === Asset Category (Custom) ===

export interface AssetCategoryCustom {
  readonly id: string
  readonly name: string
  readonly icon: string | null
  readonly color: string | null
  readonly sortOrder: number
  readonly createdAt: string
  readonly updatedAt: string
}

// === Tag ===

export interface Tag {
  readonly id: string
  readonly name: string
  readonly color: string | null
  readonly createdAt: string
}

// === Budget ===

export interface Budget {
  readonly id: string
  readonly name: string
  readonly year: number
  readonly month: number | null // NULL이면 연간 예산
  readonly totalIncome: number // KRW 정수
  readonly totalExpense: number // KRW 정수
  readonly memo: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

export interface BudgetItem {
  readonly id: string
  readonly budgetId: string
  readonly categoryId: string
  readonly plannedAmount: number // KRW 정수
  readonly memo: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

export interface BudgetItemWithActual extends BudgetItem {
  readonly categoryName: string
  readonly categoryType: CategoryType
  readonly actualAmount: number // 실적
  readonly difference: number // planned - actual
  readonly achievementRate: number // (actual / planned) * 100
}

export interface BudgetWithItems extends Budget {
  readonly items: readonly BudgetItemWithActual[]
}

export interface MonthlyBudgetSummary {
  readonly month: number
  readonly budgetId: string | null
  readonly plannedIncome: number
  readonly plannedExpense: number
  readonly actualIncome: number
  readonly actualExpense: number
}

export interface AnnualBudgetSummary {
  readonly year: number
  readonly months: readonly MonthlyBudgetSummary[]
  readonly totalPlannedIncome: number
  readonly totalPlannedExpense: number
  readonly totalActualIncome: number
  readonly totalActualExpense: number
}

// === API Response ===

export interface PaginationMeta {
  readonly total: number
  readonly page: number
  readonly limit: number
  readonly totalPages: number
}

export interface ApiSuccessResponse<T> {
  readonly success: true
  readonly data: T
  readonly meta?: PaginationMeta
}

export interface ApiErrorResponse {
  readonly success: false
  readonly error: {
    readonly code: string
    readonly message: string
  }
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse

export interface PaginatedResponse<T> {
  readonly success: true
  readonly data: readonly T[]
  readonly meta: PaginationMeta
}

// === Settlement (결산) ===

export interface CategorySubtotal {
  readonly categoryId: string
  readonly categoryName: string
  readonly amount: number
}

export interface AccountChange {
  readonly accountId: string
  readonly accountName: string
  readonly openingBalance: number
  readonly income: number
  readonly expense: number
  readonly closingBalance: number
}

export interface MonthlySettlement {
  readonly year: number
  readonly month: number
  readonly totalIncome: number
  readonly totalExpense: number
  readonly netIncome: number
  readonly incomeByCategory: readonly CategorySubtotal[]
  readonly expenseByCategory: readonly CategorySubtotal[]
  readonly accountChanges: readonly AccountChange[]
  readonly previousMonth: {
    readonly totalIncome: number
    readonly totalExpense: number
    readonly netIncome: number
  } | null
}

export interface MonthlyRow {
  readonly month: number
  readonly income: number
  readonly expense: number
  readonly netIncome: number
}

export interface AnnualSettlement {
  readonly year: number
  readonly totalIncome: number
  readonly totalExpense: number
  readonly netIncome: number
  readonly months: readonly MonthlyRow[]
  readonly incomeByCategory: readonly CategorySubtotal[]
  readonly expenseByCategory: readonly CategorySubtotal[]
  readonly previousYear: {
    readonly totalIncome: number
    readonly totalExpense: number
    readonly netIncome: number
  } | null
}

// === Reports (보고서) ===

export interface IncomeExpenseTrendItem {
  readonly yearMonth: string // YYYY-MM
  readonly income: number
  readonly expense: number
  readonly netIncome: number
}

export interface CategoryAnalysisItem {
  readonly categoryId: string
  readonly categoryName: string
  readonly amount: number
  readonly ratio: number // 0~100
  readonly rank: number
}

export interface CategoryAnalysis {
  readonly year: number
  readonly month: number
  readonly totalExpense: number
  readonly items: readonly CategoryAnalysisItem[]
}

export interface NetWorthPoint {
  readonly yearMonth: string // YYYY-MM
  readonly totalBalance: number
}

// === Asset ===

export type AssetType =
  | 'real_estate' | 'vehicle' | 'stock' | 'fund' | 'deposit'
  | 'savings' | 'bond' | 'crypto' | 'insurance' | 'pension' | 'other'

export type AssetCategory = 'financial' | 'non_financial'

export interface Asset {
  readonly id: string
  readonly name: string
  readonly type: AssetType
  readonly category: AssetCategory
  readonly assetCategoryId: string | null
  readonly acquisitionDate: string // YYYY-MM-DD
  readonly acquisitionCost: number // KRW 정수
  readonly currentValue: number // KRW 정수
  readonly accountId: string | null
  readonly institution: string | null
  readonly memo: string | null
  readonly isActive: boolean
  readonly metadata: string | null // JSON
  readonly createdAt: string
  readonly updatedAt: string
}

export interface AssetValuation {
  readonly id: string
  readonly assetId: string
  readonly date: string // YYYY-MM-DD
  readonly value: number // KRW 정수
  readonly source: 'manual' | 'api' | 'estimate'
  readonly memo: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

export interface InvestmentReturn {
  readonly id: string
  readonly assetId: string
  readonly year: number
  readonly month: number
  readonly investedAmount: number // KRW 정수
  readonly dividendIncome: number // KRW 정수
  readonly realizedGain: number // KRW 정수
  readonly unrealizedGain: number // KRW 정수
  readonly returnRate: number | null // 수익률 (%)
  readonly memo: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

export interface AssetWithValuations extends Asset {
  readonly valuations: readonly AssetValuation[]
}

export interface PortfolioSummary {
  readonly totalAssetValue: number // 총 자산가치
  readonly totalAcquisitionCost: number // 총 취득원가
  readonly totalGain: number // 총 평가손익
  readonly totalReturnRate: number // 전체 수익률 (%)
  readonly byType: readonly PortfolioGroup[]
  readonly byCategory: readonly PortfolioGroup[]
}

export interface PortfolioGroup {
  readonly label: string
  readonly value: number
  readonly ratio: number // 비중 (%)
  readonly count: number
}

export interface InvestmentSummary {
  readonly year: number
  readonly totalInvestedAmount: number
  readonly totalDividendIncome: number
  readonly totalRealizedGain: number
  readonly totalUnrealizedGain: number
  readonly averageReturnRate: number
  readonly byAsset: readonly AssetReturnSummary[]
}

export interface AssetReturnSummary {
  readonly assetId: string
  readonly assetName: string
  readonly totalInvestedAmount: number
  readonly totalDividendIncome: number
  readonly totalRealizedGain: number
  readonly totalUnrealizedGain: number
  readonly averageReturnRate: number
}

// === Recurring Transaction ===

export type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface RecurringTransaction {
  readonly id: string
  readonly type: TransactionType
  readonly amount: number // KRW 정수
  readonly description: string
  readonly categoryId: string | null
  readonly accountId: string
  readonly toAccountId: string | null
  readonly frequency: RecurringFrequency
  readonly interval: number
  readonly startDate: string // YYYY-MM-DD
  readonly endDate: string | null
  readonly nextDate: string // YYYY-MM-DD
  readonly isActive: boolean
  readonly createdAt: string
  readonly updatedAt: string
}

// === Forecast ===

export interface ForecastAssumptions {
  readonly incomeGrowthRate?: number // 수입 증가율 (%, 연간)
  readonly expenseGrowthRate?: number // 지출 변동율 (%, 연간)
  readonly inflationRate?: number // 인플레이션율 (%)
  readonly assetGrowthRates?: Record<string, number> // 자산유형별 성장률 (%)
}

export interface ForecastScenario {
  readonly id: string
  readonly name: string
  readonly description: string | null
  readonly assumptions: ForecastAssumptions | null
  readonly startDate: string // YYYY-MM-DD
  readonly endDate: string // YYYY-MM-DD
  readonly createdAt: string
  readonly updatedAt: string
}

export interface ForecastResult {
  readonly id: string
  readonly scenarioId: string
  readonly date: string // YYYY-MM-DD
  readonly projectedIncome: number // KRW 정수
  readonly projectedExpense: number // KRW 정수
  readonly projectedBalance: number // KRW 정수
  readonly projectedNetWorth: number // KRW 정수
  readonly details: ForecastResultDetails | null
  readonly createdAt: string
  readonly updatedAt: string
}

export interface ForecastResultDetails {
  readonly recurringIncome?: number
  readonly recurringExpense?: number
  readonly historicalIncome?: number
  readonly historicalExpense?: number
  readonly assetProjections?: readonly AssetProjection[]
}

export interface AssetProjection {
  readonly assetId: string
  readonly assetName: string
  readonly currentValue: number
  readonly projectedValue: number
  readonly growthRate: number
}

export interface ForecastSummary {
  readonly scenario: ForecastScenario
  readonly results: readonly ForecastResult[]
}

// === Annual Grid ===

export interface AnnualGridCategory {
  readonly id: string
  readonly name: string
  readonly icon: string | null
  readonly months: Record<number, number> // 1-12
  readonly total: number
}

export interface AnnualGridGroup {
  readonly parent: { readonly id: string; readonly name: string; readonly icon: string | null }
  readonly categories: readonly AnnualGridCategory[]
  readonly monthlyTotals: Record<number, number>
  readonly total: number
}

export interface AnnualGridData {
  readonly groups: readonly AnnualGridGroup[]
  readonly monthlyTotals: Record<number, number>
  readonly grandTotal: number
}

// === Filters ===

export interface DateRange {
  readonly from: string // YYYY-MM-DD
  readonly to: string // YYYY-MM-DD
}

export interface TransactionFilter {
  readonly type?: TransactionType
  readonly categoryId?: string
  readonly accountId?: string
  readonly dateRange?: DateRange
  readonly minAmount?: number
  readonly maxAmount?: number
  readonly search?: string
  readonly tags?: readonly string[]
}

// === Pagination ===

export interface PaginationParams {
  readonly page?: number
  readonly limit?: number
}
