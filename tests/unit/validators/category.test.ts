import { describe, it, expect } from 'vitest'
import {
  createCategorySchema,
  updateCategorySchema,
} from '@/lib/validators/category'

describe('createCategorySchema', () => {
  const validCategory = {
    name: '식비',
    type: 'expense' as const,
  }

  it('유효한 카테고리를 검증한다', () => {
    const result = createCategorySchema.safeParse(validCategory)
    expect(result.success).toBe(true)
  })

  it('이름이 비어있으면 실패한다', () => {
    const result = createCategorySchema.safeParse({ ...validCategory, name: '' })
    expect(result.success).toBe(false)
  })

  it('잘못된 카테고리 유형이면 실패한다', () => {
    const result = createCategorySchema.safeParse({ ...validCategory, type: 'transfer' })
    expect(result.success).toBe(false)
  })

  it('income과 expense 유형을 허용한다', () => {
    expect(createCategorySchema.safeParse({ name: '급여', type: 'income' }).success).toBe(true)
    expect(createCategorySchema.safeParse({ name: '교통비', type: 'expense' }).success).toBe(true)
  })

  it('선택 필드의 기본값이 올바르다', () => {
    const result = createCategorySchema.safeParse(validCategory)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.icon).toBeNull()
      expect(result.data.color).toBeNull()
      expect(result.data.parentId).toBeNull()
    }
  })

  it('부모 카테고리를 지정할 수 있다', () => {
    const withParent = { ...validCategory, parentId: 'cat_parent' }
    const result = createCategorySchema.safeParse(withParent)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.parentId).toBe('cat_parent')
    }
  })
})

describe('updateCategorySchema', () => {
  it('부분 업데이트를 허용한다', () => {
    const result = updateCategorySchema.safeParse({ name: '외식비' })
    expect(result.success).toBe(true)
  })

  it('빈 객체도 허용한다', () => {
    const result = updateCategorySchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('잘못된 유형은 거부한다', () => {
    const result = updateCategorySchema.safeParse({ type: 'invalid' })
    expect(result.success).toBe(false)
  })
})
