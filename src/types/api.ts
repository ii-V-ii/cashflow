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
