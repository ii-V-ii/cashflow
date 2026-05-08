import type { TransactionType } from '@/types'
import {
  isSavingCategory,
  shouldTreatTransferAsSaving,
  type AccountLike,
  type CategoryLike,
} from './transaction-classification'

export interface TransactionFormValues {
  type: TransactionType
  amount: number
  description: string
  categoryId?: string
  accountId: string
  toAccountId?: string
  date: string
  memo?: string
  tags: string[]
  installmentMonths?: number | null
}

export interface TransactionPayload {
  type: TransactionType
  amount: number
  description: string
  categoryId: string | null
  accountId: string
  toAccountId: string | null
  date: string
  memo: string | null
  tags: string[]
  installmentMonths: number | null
  installmentCurrent: number | null
}

interface BuildPayloadInput {
  values: TransactionFormValues
  toAccount: AccountLike | null | undefined
  category: CategoryLike | null | undefined
}

export function buildTransactionPayload({
  values,
  toAccount,
  category,
}: BuildPayloadInput): TransactionPayload {
  const categoryId = values.categoryId || null
  const toAccountId = values.toAccountId || null

  // Auto-conversion: transfer → expense when destination is a savings/investment
  // account AND a saving category is selected. If no saving category is selected,
  // keep as transfer to avoid creating an invalid expense without a category.
  let type: TransactionType = values.type
  if (
    type === 'transfer' &&
    shouldTreatTransferAsSaving(toAccount) &&
    isSavingCategory(category)
  ) {
    type = 'expense'
  }

  return {
    type,
    amount: values.amount,
    description: values.description,
    categoryId,
    accountId: values.accountId,
    toAccountId,
    date: values.date,
    memo: values.memo || null,
    tags: values.tags,
    installmentMonths: values.installmentMonths ?? null,
    installmentCurrent: values.installmentMonths ? 1 : null,
  }
}
