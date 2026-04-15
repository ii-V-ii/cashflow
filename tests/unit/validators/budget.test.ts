import { describe, it, expect } from 'vitest'
import {
  createBudgetSchema,
  updateBudgetSchema,
  copyBudgetSchema,
  updateAnnualGridCellSchema,
} from '@/lib/validators/budget'

describe('createBudgetSchema', () => {
  const validBudget = {
    name: '4월 예산',
    year: 2026,
    month: 4,
  }

  it('유효한 월 예산을 통과한다', () => {
    const result = createBudgetSchema.safeParse(validBudget)
    expect(result.success).toBe(true)
  })

  it('연간 예산(month null)을 통과한다', () => {
    const result = createBudgetSchema.safeParse({ ...validBudget, month: null })
    expect(result.success).toBe(true)
  })

  it('항목 포함 예산을 통과한다', () => {
    const result = createBudgetSchema.safeParse({
      ...validBudget,
      items: [
        { categoryId: 'cat_1', plannedAmount: 500000 },
        { categoryId: 'cat_2', plannedAmount: 300000, memo: '식비 목표' },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('이름이 빈 문자열이면 실패한다', () => {
    const result = createBudgetSchema.safeParse({ ...validBudget, name: '' })
    expect(result.success).toBe(false)
  })

  it('year가 2000 미만이면 실패한다', () => {
    const result = createBudgetSchema.safeParse({ ...validBudget, year: 1999 })
    expect(result.success).toBe(false)
  })

  it('month가 13이면 실패한다', () => {
    const result = createBudgetSchema.safeParse({ ...validBudget, month: 13 })
    expect(result.success).toBe(false)
  })

  it('항목의 plannedAmount가 음수이면 실패한다', () => {
    const result = createBudgetSchema.safeParse({
      ...validBudget,
      items: [{ categoryId: 'cat_1', plannedAmount: -100 }],
    })
    expect(result.success).toBe(false)
  })

  it('기본값이 올바르게 설정된다', () => {
    const result = createBudgetSchema.safeParse(validBudget)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.totalIncome).toBe(0)
      expect(result.data.totalExpense).toBe(0)
      expect(result.data.memo).toBeNull()
      expect(result.data.items).toEqual([])
    }
  })
})

describe('updateBudgetSchema', () => {
  it('부분 업데이트를 허용한다', () => {
    const result = updateBudgetSchema.safeParse({ name: '수정된 예산' })
    expect(result.success).toBe(true)
  })

  it('빈 객체를 허용한다', () => {
    const result = updateBudgetSchema.safeParse({})
    expect(result.success).toBe(true)
  })
})

describe('copyBudgetSchema', () => {
  it('유효한 복사 요청을 통과한다', () => {
    const result = copyBudgetSchema.safeParse({
      sourceYear: 2026, sourceMonth: 3,
      targetYear: 2026, targetMonth: 4,
    })
    expect(result.success).toBe(true)
  })

  it('월이 범위를 벗어나면 실패한다', () => {
    const result = copyBudgetSchema.safeParse({
      sourceYear: 2026, sourceMonth: 0,
      targetYear: 2026, targetMonth: 4,
    })
    expect(result.success).toBe(false)
  })
})

describe('updateAnnualGridCellSchema', () => {
  it('유효한 셀 업데이트를 통과한다', () => {
    const result = updateAnnualGridCellSchema.safeParse({
      year: 2026, month: 4, categoryId: 'cat_1', amount: 500000,
    })
    expect(result.success).toBe(true)
  })

  it('amount가 음수이면 실패한다', () => {
    const result = updateAnnualGridCellSchema.safeParse({
      year: 2026, month: 4, categoryId: 'cat_1', amount: -1,
    })
    expect(result.success).toBe(false)
  })
})
