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
