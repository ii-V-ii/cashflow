import { describe, it, expect } from 'vitest'
import { createAssetCategorySchema, updateAssetCategorySchema } from '@/lib/validators/asset-category'

describe('createAssetCategorySchema', () => {
  it('유효한 금융 자산 카테고리를 통과한다', () => {
    const result = createAssetCategorySchema.safeParse({ name: '금융자산', kind: 'financial' })
    expect(result.success).toBe(true)
  })

  it('유효한 비금융 자산 카테고리를 통과한다', () => {
    const result = createAssetCategorySchema.safeParse({ name: '부동산', kind: 'non_financial' })
    expect(result.success).toBe(true)
  })

  it('이름이 빈 문자열이면 실패한다', () => {
    const result = createAssetCategorySchema.safeParse({ name: '', kind: 'financial' })
    expect(result.success).toBe(false)
  })

  it('이름이 50자를 초과하면 실패한다', () => {
    const result = createAssetCategorySchema.safeParse({ name: 'a'.repeat(51), kind: 'financial' })
    expect(result.success).toBe(false)
  })

  it('잘못된 kind이면 실패한다', () => {
    const result = createAssetCategorySchema.safeParse({ name: '기타', kind: 'other' })
    expect(result.success).toBe(false)
  })

  it('기본값이 올바르게 설정된다', () => {
    const result = createAssetCategorySchema.safeParse({ name: '금융자산', kind: 'financial' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.icon).toBeNull()
      expect(result.data.color).toBeNull()
      expect(result.data.sortOrder).toBe(0)
    }
  })

  it('sortOrder가 음수이면 실패한다', () => {
    const result = createAssetCategorySchema.safeParse({ name: '금융', kind: 'financial', sortOrder: -1 })
    expect(result.success).toBe(false)
  })
})

describe('updateAssetCategorySchema', () => {
  it('부분 업데이트를 허용한다', () => {
    const result = updateAssetCategorySchema.safeParse({ name: '수정된 카테고리' })
    expect(result.success).toBe(true)
  })

  it('빈 객체를 허용한다', () => {
    const result = updateAssetCategorySchema.safeParse({})
    expect(result.success).toBe(true)
  })
})
