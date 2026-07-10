/**
 * 공유 타입 (API DTO 포함).
 * Phase 0: 쿼리 키 팩토리가 참조하는 필터 골격만 정의한다.
 * 각 기능 트랙에서 API.md의 요청/응답과 1:1로 확장한다.
 */

export type TransactionType = "income" | "expense" | "transfer"
export type TransactionStatus = "pending" | "applied"
export type RecurringFrequency = "daily" | "weekly" | "monthly" | "yearly"
export type AccountType = "cash" | "bank" | "card" | "savings" | "investment"
export type ExpenseKind = "consumption" | "saving"
export type DepositType = "lump_sum" | "installment"
export type TaxType = "normal" | "preferential" | "tax_free" | "high"

/** 예측 가정치 (API.md §13.1) */
export interface ForecastAssumptions {
  readonly incomeGrowthRate?: number // 수입 증가율 (%, 연간)
  readonly expenseGrowthRate?: number // 지출 변동율 (%, 연간)
  readonly inflationRate?: number // 인플레이션율 (%)
  readonly assetGrowthRates?: Record<string, number> // 자산 카테고리별 성장률 (%)
}

export interface TransactionFilter {
  type?: TransactionType
  accountId?: string
  categoryId?: string
  tagIds?: string[]
  from?: string
  to?: string
  search?: string
}

export interface AssetFilter {
  kind?: "financial" | "non_financial"
  activeOnly?: boolean
}

export interface TradeFilter {
  assetId?: string
  tradeType?: "buy" | "sell" | "dividend"
  from?: string
  to?: string
}

export interface TradeRangeFilter {
  from?: string
  to?: string
}
