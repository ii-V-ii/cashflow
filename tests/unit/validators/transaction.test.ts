import { describe, it, expect } from 'vitest'
import {
  createTransactionSchema,
  updateTransactionSchema,
} from '@/lib/validators/transaction'

describe('createTransactionSchema', () => {
  const validIncome = {
    type: 'income' as const,
    amount: 50000,
    description: '급여',
    accountId: 'acc_1',
    date: '2026-04-01',
  }

  const validExpense = {
    type: 'expense' as const,
    amount: 15000,
    description: '점심식사',
    categoryId: 'cat_1',
    accountId: 'acc_1',
    date: '2026-04-01',
  }

  const validTransfer = {
    type: 'transfer' as const,
    amount: 100000,
    description: '저축 이체',
    accountId: 'acc_1',
    toAccountId: 'acc_2',
    date: '2026-04-01',
  }

  it('수입 거래를 검증한다', () => {
    const result = createTransactionSchema.safeParse(validIncome)
    expect(result.success).toBe(true)
  })

  it('지출 거래를 검증한다', () => {
    const result = createTransactionSchema.safeParse(validExpense)
    expect(result.success).toBe(true)
  })

  it('이체 거래를 검증한다', () => {
    const result = createTransactionSchema.safeParse(validTransfer)
    expect(result.success).toBe(true)
  })

  it('금액이 0 이하이면 실패한다', () => {
    const result = createTransactionSchema.safeParse({ ...validIncome, amount: 0 })
    expect(result.success).toBe(false)
  })

  it('금액이 소수점이면 실패한다', () => {
    const result = createTransactionSchema.safeParse({ ...validIncome, amount: 100.5 })
    expect(result.success).toBe(false)
  })

  it('설명이 비어있으면 실패한다', () => {
    const result = createTransactionSchema.safeParse({ ...validIncome, description: '' })
    expect(result.success).toBe(false)
  })

  it('잘못된 type이면 실패한다', () => {
    const result = createTransactionSchema.safeParse({ ...validIncome, type: 'refund' })
    expect(result.success).toBe(false)
  })

  it('잘못된 날짜 형식이면 실패한다', () => {
    const result = createTransactionSchema.safeParse({ ...validIncome, date: '04/01/2026' })
    expect(result.success).toBe(false)
  })

  it('이체 시 toAccountId가 없으면 실패한다', () => {
    const transferWithoutTo = {
      type: 'transfer' as const,
      amount: 100000,
      description: '이체',
      accountId: 'acc_1',
      date: '2026-04-01',
    }
    const result = createTransactionSchema.safeParse(transferWithoutTo)
    expect(result.success).toBe(false)
  })

  it('이체 시 같은 계좌로 보내면 실패한다', () => {
    const sameAccount = { ...validTransfer, toAccountId: 'acc_1' }
    const result = createTransactionSchema.safeParse(sameAccount)
    expect(result.success).toBe(false)
  })

  it('memo와 tags는 선택사항이다', () => {
    const result = createTransactionSchema.safeParse(validIncome)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.memo).toBeNull()
      expect(result.data.tags).toEqual([])
    }
  })

  it('tags 배열을 파싱한다', () => {
    const withTags = { ...validExpense, tags: ['식비', '외식'] }
    const result = createTransactionSchema.safeParse(withTags)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.tags).toEqual(['식비', '외식'])
    }
  })
})

describe('updateTransactionSchema', () => {
  it('부분 업데이트를 허용한다', () => {
    const result = updateTransactionSchema.safeParse({ amount: 30000 })
    expect(result.success).toBe(true)
  })

  it('금액만 업데이트할 수 있다', () => {
    const result = updateTransactionSchema.safeParse({ amount: 25000 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.amount).toBe(25000)
    }
  })

  it('빈 객체도 허용한다', () => {
    const result = updateTransactionSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('잘못된 값은 거부한다', () => {
    const result = updateTransactionSchema.safeParse({ amount: -100 })
    expect(result.success).toBe(false)
  })
})
