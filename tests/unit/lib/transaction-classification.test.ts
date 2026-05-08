import { describe, it, expect } from 'vitest'
import {
  getTransactionDisplayKind,
  isSavingTransaction,
  isSavingCategory,
  isSavingAccount,
  shouldTreatTransferAsSaving,
  type TransactionLike,
  type CategoryLike,
  type AccountLike,
} from '@/lib/transaction-classification'

describe('isSavingCategory', () => {
  it('expense + saving 카테고리는 저축으로 본다', () => {
    expect(isSavingCategory({ type: 'expense', expenseKind: 'saving' })).toBe(true)
  })

  it('expense + consumption 카테고리는 저축이 아니다', () => {
    expect(isSavingCategory({ type: 'expense', expenseKind: 'consumption' })).toBe(false)
  })

  it('income 카테고리는 저축이 아니다', () => {
    expect(isSavingCategory({ type: 'income', expenseKind: null })).toBe(false)
  })

  it('null/undefined 카테고리는 저축이 아니다', () => {
    expect(isSavingCategory(null)).toBe(false)
    expect(isSavingCategory(undefined)).toBe(false)
  })

  it('expenseKind가 null인 expense는 저축이 아니다', () => {
    expect(isSavingCategory({ type: 'expense', expenseKind: null })).toBe(false)
  })
})

describe('isSavingAccount', () => {
  it('savings 타입 계좌는 저축계좌다', () => {
    expect(isSavingAccount({ type: 'savings' })).toBe(true)
  })

  it('investment 타입 계좌는 저축계좌다', () => {
    expect(isSavingAccount({ type: 'investment' })).toBe(true)
  })

  it('cash, bank, card는 저축계좌가 아니다', () => {
    expect(isSavingAccount({ type: 'cash' })).toBe(false)
    expect(isSavingAccount({ type: 'bank' })).toBe(false)
    expect(isSavingAccount({ type: 'card' })).toBe(false)
  })

  it('null/undefined는 저축계좌가 아니다', () => {
    expect(isSavingAccount(null)).toBe(false)
    expect(isSavingAccount(undefined)).toBe(false)
  })
})

describe('isSavingTransaction', () => {
  const savingCategory: CategoryLike = { type: 'expense', expenseKind: 'saving' }
  const consumptionCategory: CategoryLike = { type: 'expense', expenseKind: 'consumption' }

  it('expense 거래 + saving 카테고리는 저축이다', () => {
    const tx: TransactionLike = { type: 'expense', categoryId: 'cat_1' }
    expect(isSavingTransaction(tx, savingCategory)).toBe(true)
  })

  it('expense 거래 + 일반 소비 카테고리는 저축이 아니다', () => {
    const tx: TransactionLike = { type: 'expense', categoryId: 'cat_1' }
    expect(isSavingTransaction(tx, consumptionCategory)).toBe(false)
  })

  it('income 거래는 저축이 아니다', () => {
    const tx: TransactionLike = { type: 'income', categoryId: 'cat_1' }
    expect(isSavingTransaction(tx, savingCategory)).toBe(false)
  })

  it('transfer 거래는 저축이 아니다 (이미 expense로 마이그레이션되었어야 함)', () => {
    const tx: TransactionLike = { type: 'transfer', categoryId: 'cat_1' }
    expect(isSavingTransaction(tx, savingCategory)).toBe(false)
  })

  it('카테고리 정보가 없으면 저축이 아니다', () => {
    const tx: TransactionLike = { type: 'expense', categoryId: 'cat_1' }
    expect(isSavingTransaction(tx, null)).toBe(false)
    expect(isSavingTransaction(tx, undefined)).toBe(false)
  })
})

describe('getTransactionDisplayKind', () => {
  const savingCategory: CategoryLike = { type: 'expense', expenseKind: 'saving' }
  const consumptionCategory: CategoryLike = { type: 'expense', expenseKind: 'consumption' }

  it('income 거래는 income으로 분류된다', () => {
    expect(getTransactionDisplayKind({ type: 'income', categoryId: null }, undefined)).toBe('income')
  })

  it('일반 expense 거래는 expense로 분류된다', () => {
    expect(getTransactionDisplayKind({ type: 'expense', categoryId: 'c1' }, consumptionCategory)).toBe('expense')
  })

  it('expense + saving 카테고리는 saving으로 분류된다', () => {
    expect(getTransactionDisplayKind({ type: 'expense', categoryId: 'c1' }, savingCategory)).toBe('saving')
  })

  it('transfer 거래는 transfer로 분류된다', () => {
    expect(getTransactionDisplayKind({ type: 'transfer', categoryId: null }, undefined)).toBe('transfer')
  })

  it('expense인데 카테고리 정보가 없으면 expense로 분류한다', () => {
    expect(getTransactionDisplayKind({ type: 'expense', categoryId: null }, undefined)).toBe('expense')
  })
})

describe('shouldTreatTransferAsSaving', () => {
  const savingsAccount: AccountLike = { type: 'savings' }
  const investmentAccount: AccountLike = { type: 'investment' }
  const bankAccount: AccountLike = { type: 'bank' }

  it('도착 계좌가 savings면 저축 의도로 본다', () => {
    expect(shouldTreatTransferAsSaving(savingsAccount)).toBe(true)
  })

  it('도착 계좌가 investment면 저축 의도로 본다', () => {
    expect(shouldTreatTransferAsSaving(investmentAccount)).toBe(true)
  })

  it('도착 계좌가 일반 bank면 저축 의도가 아니다', () => {
    expect(shouldTreatTransferAsSaving(bankAccount)).toBe(false)
  })

  it('도착 계좌가 없으면 저축 의도가 아니다', () => {
    expect(shouldTreatTransferAsSaving(null)).toBe(false)
    expect(shouldTreatTransferAsSaving(undefined)).toBe(false)
  })
})
