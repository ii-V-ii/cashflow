import { describe, it, expect } from 'vitest'
import { buildTransactionPayload } from '@/lib/transaction-form-payload'
import type { AccountLike, CategoryLike } from '@/lib/transaction-classification'

const savingsAccount: AccountLike = { type: 'savings' }
const investmentAccount: AccountLike = { type: 'investment' }
const bankAccount: AccountLike = { type: 'bank' }

const savingCategory: CategoryLike = { type: 'expense', expenseKind: 'saving' }

describe('buildTransactionPayload', () => {
  const baseValues = {
    type: 'expense' as const,
    amount: 100000,
    description: '저축 이체',
    accountId: 'acc_kb',
    date: '2026-05-01',
    memo: '',
    tags: [] as string[],
  }

  it('일반 지출은 type을 그대로 유지한다', () => {
    const result = buildTransactionPayload({
      values: baseValues,
      toAccount: undefined,
      category: { type: 'expense', expenseKind: 'consumption' },
    })
    expect(result.type).toBe('expense')
    expect(result.toAccountId).toBeNull()
  })

  it('일반 이체(양쪽 일반 계좌)는 transfer를 유지한다', () => {
    const result = buildTransactionPayload({
      values: { ...baseValues, type: 'transfer', toAccountId: 'acc_kb2' },
      toAccount: bankAccount,
      category: undefined,
    })
    expect(result.type).toBe('transfer')
    expect(result.toAccountId).toBe('acc_kb2')
    expect(result.categoryId).toBeNull()
  })

  it('transfer 탭 + 도착이 savings 계좌면 expense로 자동 변환한다', () => {
    const result = buildTransactionPayload({
      values: {
        ...baseValues,
        type: 'transfer',
        toAccountId: 'acc_savings',
        categoryId: 'cat_deposit',
      },
      toAccount: savingsAccount,
      category: savingCategory,
    })
    expect(result.type).toBe('expense')
    expect(result.toAccountId).toBe('acc_savings')
    expect(result.categoryId).toBe('cat_deposit')
  })

  it('transfer 탭 + 도착이 investment 계좌도 expense로 자동 변환한다', () => {
    const result = buildTransactionPayload({
      values: {
        ...baseValues,
        type: 'transfer',
        toAccountId: 'acc_invest',
        categoryId: 'cat_stock',
      },
      toAccount: investmentAccount,
      category: savingCategory,
    })
    expect(result.type).toBe('expense')
  })

  it('expense + saving 카테고리 + 도착 계좌는 그대로 expense로 저장한다', () => {
    const result = buildTransactionPayload({
      values: {
        ...baseValues,
        type: 'expense',
        toAccountId: 'acc_savings',
        categoryId: 'cat_deposit',
      },
      toAccount: savingsAccount,
      category: savingCategory,
    })
    expect(result.type).toBe('expense')
    expect(result.toAccountId).toBe('acc_savings')
    expect(result.categoryId).toBe('cat_deposit')
  })

  it('memo가 빈 문자열이면 null로 변환한다', () => {
    const result = buildTransactionPayload({
      values: { ...baseValues, memo: '' },
      toAccount: undefined,
      category: undefined,
    })
    expect(result.memo).toBeNull()
  })

  it('categoryId가 빈 문자열이면 null로 변환한다', () => {
    const result = buildTransactionPayload({
      values: { ...baseValues, categoryId: '' },
      toAccount: undefined,
      category: undefined,
    })
    expect(result.categoryId).toBeNull()
  })

  it('할부개월이 있으면 installmentCurrent를 1로 설정한다', () => {
    const result = buildTransactionPayload({
      values: { ...baseValues, installmentMonths: 6 },
      toAccount: undefined,
      category: undefined,
    })
    expect(result.installmentMonths).toBe(6)
    expect(result.installmentCurrent).toBe(1)
  })

  it('할부개월이 없으면 installmentCurrent도 null이다', () => {
    const result = buildTransactionPayload({
      values: baseValues,
      toAccount: undefined,
      category: undefined,
    })
    expect(result.installmentMonths).toBeNull()
    expect(result.installmentCurrent).toBeNull()
  })

  it('transfer + saving 계좌인데 카테고리가 없으면 transfer로 유지한다 (사용자가 카테고리 선택 안 함)', () => {
    const result = buildTransactionPayload({
      values: {
        ...baseValues,
        type: 'transfer',
        toAccountId: 'acc_savings',
        categoryId: '',
      },
      toAccount: savingsAccount,
      category: undefined,
    })
    // 카테고리 없이 expense로 변환하면 검증 실패하므로 transfer로 유지
    expect(result.type).toBe('transfer')
    expect(result.categoryId).toBeNull()
  })
})
