import type {
  AccountType,
  ExpenseKind,
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

export interface PageDto<T> {
  items: T[]
  total: number
  page: number
  limit: number
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
