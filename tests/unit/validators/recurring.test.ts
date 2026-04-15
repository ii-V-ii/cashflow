import { describe, it, expect } from 'vitest'
import { createRecurringTransactionSchema, updateRecurringTransactionSchema } from '@/lib/validators/recurring'

const validRecurring = {
  type: 'expense' as const,
  amount: 50000,
  description: '넷플릭스',
  accountId: 'acc_1',
  frequency: 'monthly' as const,
  startDate: '2026-01-01',
}

describe('createRecurringTransactionSchema', () => {
  it('유효한 정기 지출을 통과한다', () => {
    const result = createRecurringTransactionSchema.safeParse(validRecurring)
    expect(result.success).toBe(true)
  })

  it('유효한 정기 수입을 통과한다', () => {
    const result = createRecurringTransactionSchema.safeParse({
      ...validRecurring,
      type: 'income',
      amount: 5000000,
      description: '급여',
    })
    expect(result.success).toBe(true)
  })

  it('유효한 정기 이체를 통과한다', () => {
    const result = createRecurringTransactionSchema.safeParse({
      ...validRecurring,
      type: 'transfer',
      toAccountId: 'acc_2',
    })
    expect(result.success).toBe(true)
  })

  it('이체 시 도착 계좌가 없으면 실패한다', () => {
    const result = createRecurringTransactionSchema.safeParse({
      ...validRecurring,
      type: 'transfer',
    })
    expect(result.success).toBe(false)
  })

  it('이체 시 출발/도착 계좌가 같으면 실패한다', () => {
    const result = createRecurringTransactionSchema.safeParse({
      ...validRecurring,
      type: 'transfer',
      toAccountId: 'acc_1',
    })
    expect(result.success).toBe(false)
  })

  it('금액이 0 이하이면 실패한다', () => {
    const result = createRecurringTransactionSchema.safeParse({ ...validRecurring, amount: 0 })
    expect(result.success).toBe(false)
  })

  it('설명이 빈 문자열이면 실패한다', () => {
    const result = createRecurringTransactionSchema.safeParse({ ...validRecurring, description: '' })
    expect(result.success).toBe(false)
  })

  it('잘못된 날짜 형식이면 실패한다', () => {
    const result = createRecurringTransactionSchema.safeParse({ ...validRecurring, startDate: '2026/01/01' })
    expect(result.success).toBe(false)
  })

  it('모든 빈도를 허용한다', () => {
    for (const frequency of ['daily', 'weekly', 'monthly', 'yearly'] as const) {
      const result = createRecurringTransactionSchema.safeParse({ ...validRecurring, frequency })
      expect(result.success).toBe(true)
    }
  })

  it('interval은 1~365 범위여야 한다', () => {
    expect(createRecurringTransactionSchema.safeParse({ ...validRecurring, interval: 0 }).success).toBe(false)
    expect(createRecurringTransactionSchema.safeParse({ ...validRecurring, interval: 366 }).success).toBe(false)
    expect(createRecurringTransactionSchema.safeParse({ ...validRecurring, interval: 2 }).success).toBe(true)
  })

  it('기본값이 올바르게 설정된다', () => {
    const result = createRecurringTransactionSchema.safeParse(validRecurring)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.interval).toBe(1)
      expect(result.data.endDate).toBeNull()
      expect(result.data.categoryId).toBeNull()
      expect(result.data.toAccountId).toBeNull()
    }
  })
})

describe('updateRecurringTransactionSchema', () => {
  it('부분 업데이트를 허용한다', () => {
    const result = updateRecurringTransactionSchema.safeParse({ amount: 60000 })
    expect(result.success).toBe(true)
  })

  it('isActive 토글을 허용한다', () => {
    const result = updateRecurringTransactionSchema.safeParse({ isActive: false })
    expect(result.success).toBe(true)
  })

  it('빈 객체를 허용한다', () => {
    const result = updateRecurringTransactionSchema.safeParse({})
    expect(result.success).toBe(true)
  })
})
