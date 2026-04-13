import { describe, it, expect } from 'vitest'
import {
  createAccountSchema,
  updateAccountSchema,
} from '@/lib/validators/account'

describe('createAccountSchema', () => {
  const validAccount = {
    name: '신한은행 주거래',
    type: 'bank' as const,
    balance: 1500000,
  }

  it('유효한 계좌를 검증한다', () => {
    const result = createAccountSchema.safeParse(validAccount)
    expect(result.success).toBe(true)
  })

  it('이름이 비어있으면 실패한다', () => {
    const result = createAccountSchema.safeParse({ ...validAccount, name: '' })
    expect(result.success).toBe(false)
  })

  it('잘못된 계좌 유형이면 실패한다', () => {
    const result = createAccountSchema.safeParse({ ...validAccount, type: 'crypto' })
    expect(result.success).toBe(false)
  })

  it('잔액이 정수가 아니면 실패한다', () => {
    const result = createAccountSchema.safeParse({ ...validAccount, balance: 100.5 })
    expect(result.success).toBe(false)
  })

  it('잔액 기본값은 0이다', () => {
    const result = createAccountSchema.safeParse({ name: '현금', type: 'cash' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.balance).toBe(0)
    }
  })

  it('색상과 아이콘은 선택사항이다', () => {
    const result = createAccountSchema.safeParse(validAccount)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.color).toBeNull()
      expect(result.data.icon).toBeNull()
    }
  })

  it('색상과 아이콘을 지정할 수 있다', () => {
    const withOptionals = { ...validAccount, color: '#3B82F6', icon: 'bank' }
    const result = createAccountSchema.safeParse(withOptionals)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.color).toBe('#3B82F6')
      expect(result.data.icon).toBe('bank')
    }
  })

  it('모든 계좌 유형을 허용한다', () => {
    const types = ['cash', 'bank', 'card', 'savings', 'investment'] as const
    for (const type of types) {
      const result = createAccountSchema.safeParse({ ...validAccount, type })
      expect(result.success).toBe(true)
    }
  })
})

describe('updateAccountSchema', () => {
  it('부분 업데이트를 허용한다', () => {
    const result = updateAccountSchema.safeParse({ name: '국민은행' })
    expect(result.success).toBe(true)
  })

  it('빈 객체도 허용한다', () => {
    const result = updateAccountSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('잘못된 잔액은 거부한다', () => {
    const result = updateAccountSchema.safeParse({ balance: 100.5 })
    expect(result.success).toBe(false)
  })
})
