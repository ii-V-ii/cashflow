import type { AccountType, CategoryType, ExpenseKind, TransactionType } from '@/types'

export interface CategoryLike {
  type: CategoryType
  expenseKind: ExpenseKind | null
}

export interface AccountLike {
  type: AccountType
}

export interface TransactionLike {
  type: TransactionType
  categoryId: string | null
}

export type DisplayKind = 'income' | 'expense' | 'saving' | 'transfer'

export function isSavingCategory(category: CategoryLike | null | undefined): boolean {
  if (!category) return false
  return category.type === 'expense' && category.expenseKind === 'saving'
}

export function isSavingAccount(account: AccountLike | null | undefined): boolean {
  if (!account) return false
  return account.type === 'savings' || account.type === 'investment'
}

export function isSavingTransaction(
  tx: TransactionLike,
  category: CategoryLike | null | undefined,
): boolean {
  return tx.type === 'expense' && isSavingCategory(category)
}

export function getTransactionDisplayKind(
  tx: TransactionLike,
  category: CategoryLike | null | undefined,
): DisplayKind {
  if (isSavingTransaction(tx, category)) return 'saving'
  return tx.type
}

export function shouldTreatTransferAsSaving(
  toAccount: AccountLike | null | undefined,
): boolean {
  return isSavingAccount(toAccount)
}
