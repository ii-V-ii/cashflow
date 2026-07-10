/**
 * 공유 타입 (API DTO 포함).
 * Phase 0: 쿼리 키 팩토리가 참조하는 필터 골격만 정의한다.
 * 각 기능 트랙에서 API.md의 요청/응답과 1:1로 확장한다.
 */

export type TransactionType = "income" | "expense" | "transfer"
export type TransactionStatus = "pending" | "applied"
export type AccountType = "cash" | "bank" | "card" | "savings" | "investment"
export type ExpenseKind = "consumption" | "saving"

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
