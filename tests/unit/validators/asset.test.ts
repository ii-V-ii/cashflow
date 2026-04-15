import { describe, it, expect } from 'vitest'
import { createAssetSchema, updateAssetSchema, createValuationSchema } from '@/lib/validators/asset'

const validAsset = {
  name: 'ISA',
  assetCategoryId: 'cat_fin',
  acquisitionDate: '2026-01-01',
  acquisitionCost: 10000000,
  currentValue: 12000000,
}

describe('createAssetSchema', () => {
  it('유효한 자산을 통과한다', () => {
    const result = createAssetSchema.safeParse(validAsset)
    expect(result.success).toBe(true)
  })

  it('이름이 빈 문자열이면 실패한다', () => {
    const result = createAssetSchema.safeParse({ ...validAsset, name: '' })
    expect(result.success).toBe(false)
  })

  it('assetCategoryId가 비어있으면 실패한다', () => {
    const result = createAssetSchema.safeParse({ ...validAsset, assetCategoryId: '' })
    expect(result.success).toBe(false)
  })

  it('잘못된 날짜 형식이면 실패한다', () => {
    const result = createAssetSchema.safeParse({ ...validAsset, acquisitionDate: '2026/01/01' })
    expect(result.success).toBe(false)
  })

  it('취득원가가 음수이면 실패한다', () => {
    const result = createAssetSchema.safeParse({ ...validAsset, acquisitionCost: -1 })
    expect(result.success).toBe(false)
  })

  it('현재가치가 음수이면 실패한다', () => {
    const result = createAssetSchema.safeParse({ ...validAsset, currentValue: -1 })
    expect(result.success).toBe(false)
  })

  it('선택 필드의 기본값이 올바르다', () => {
    const result = createAssetSchema.safeParse(validAsset)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.institution).toBeNull()
      expect(result.data.memo).toBeNull()
      expect(result.data.isActive).toBe(true)
      expect(result.data.metadata).toBeNull()
    }
  })

  it('metadata를 받을 수 있다', () => {
    const result = createAssetSchema.safeParse({
      ...validAsset,
      metadata: { ticker: 'AAPL', exchange: 'NASDAQ' },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.metadata).toEqual({ ticker: 'AAPL', exchange: 'NASDAQ' })
    }
  })
})

describe('updateAssetSchema', () => {
  it('부분 업데이트를 허용한다', () => {
    const result = updateAssetSchema.safeParse({ name: '수정된 ISA' })
    expect(result.success).toBe(true)
  })

  it('빈 객체를 허용한다', () => {
    const result = updateAssetSchema.safeParse({})
    expect(result.success).toBe(true)
  })
})

describe('createValuationSchema', () => {
  it('유효한 평가를 통과한다', () => {
    const result = createValuationSchema.safeParse({ date: '2026-04-15', value: 13000000 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.source).toBe('manual')
    }
  })

  it('모든 source 유형을 허용한다', () => {
    for (const source of ['manual', 'api', 'estimate', 'auto'] as const) {
      const result = createValuationSchema.safeParse({ date: '2026-04-15', value: 13000000, source })
      expect(result.success).toBe(true)
    }
  })

  it('value가 음수이면 실패한다', () => {
    const result = createValuationSchema.safeParse({ date: '2026-04-15', value: -1 })
    expect(result.success).toBe(false)
  })

  it('잘못된 날짜 형식이면 실패한다', () => {
    const result = createValuationSchema.safeParse({ date: '04-15-2026', value: 13000000 })
    expect(result.success).toBe(false)
  })
})
