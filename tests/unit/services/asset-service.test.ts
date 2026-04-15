import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db/repositories', () => ({
  findAllAssets: vi.fn(),
  findAssetById: vi.fn(),
  findAssetsByAssetCategoryKind: vi.fn(),
  findAllAssetCategories: vi.fn(),
  createAsset: vi.fn(),
  updateAsset: vi.fn(),
  deleteAsset: vi.fn(),
  getValuations: vi.fn(),
  addValuation: vi.fn(),
}))

import {
  getAssetsService,
  getAssetByIdService,
  getAssetWithValuationsService,
  createAssetService,
  updateAssetService,
  deleteAssetService,
  addValuationService,
  getValuationsService,
  getPortfolioSummaryService,
} from '@/lib/services/asset-service'
import * as repos from '@/db/repositories'

const mockRepos = vi.mocked(repos)

const mockAsset = {
  id: 'asset_1', name: 'ISA', assetCategoryId: 'cat_fin',
  acquisitionDate: '2026-01-01', acquisitionCost: 10000000, currentValue: 12000000,
  institution: '한국투자', memo: null, isActive: true, metadata: null,
  createdAt: new Date(), updatedAt: new Date(),
}

describe('getAssetsService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('전체 자산 목록을 반환한다', async () => {
    mockRepos.findAllAssets.mockResolvedValue([mockAsset] as any)
    const result = await getAssetsService()
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toHaveLength(1)
  })

  it('kind 필터를 적용한다', async () => {
    mockRepos.findAssetsByAssetCategoryKind.mockResolvedValue([mockAsset] as any)
    await getAssetsService({ kind: 'financial' })
    expect(mockRepos.findAssetsByAssetCategoryKind).toHaveBeenCalledWith('financial')
  })
})

describe('getAssetByIdService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('존재하는 자산을 반환한다', async () => {
    mockRepos.findAssetById.mockResolvedValue(mockAsset as any)
    const result = await getAssetByIdService('asset_1')
    expect(result.success).toBe(true)
  })

  it('존재하지 않으면 에러를 반환한다', async () => {
    mockRepos.findAssetById.mockResolvedValue(null)
    const result = await getAssetByIdService('none')
    expect(result.success).toBe(false)
  })
})

describe('getAssetWithValuationsService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('자산과 평가이력을 함께 반환한다', async () => {
    mockRepos.findAssetById.mockResolvedValue(mockAsset as any)
    mockRepos.getValuations.mockResolvedValue([
      { id: 'v1', assetId: 'asset_1', date: '2026-04-15', value: 12000000, source: 'manual', memo: null, createdAt: new Date(), updatedAt: new Date() },
    ] as any)

    const result = await getAssetWithValuationsService('asset_1')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.valuations).toHaveLength(1)
    }
  })
})

describe('createAssetService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('유효한 자산을 생성한다', async () => {
    mockRepos.createAsset.mockResolvedValue(mockAsset as any)
    const result = await createAssetService({
      name: 'ISA', assetCategoryId: 'cat_fin',
      acquisitionDate: '2026-01-01', acquisitionCost: 10000000, currentValue: 12000000,
    })
    expect(result.success).toBe(true)
  })

  it('유효성 검사 실패 시 에러를 반환한다', async () => {
    const result = await createAssetService({ name: '' })
    expect(result.success).toBe(false)
  })
})

describe('updateAssetService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('자산을 수정한다', async () => {
    mockRepos.updateAsset.mockResolvedValue(mockAsset as any)
    const result = await updateAssetService('asset_1', { name: '수정된 ISA' })
    expect(result.success).toBe(true)
  })

  it('존재하지 않으면 에러를 반환한다', async () => {
    mockRepos.updateAsset.mockResolvedValue(null)
    const result = await updateAssetService('none', { name: '수정' })
    expect(result.success).toBe(false)
  })
})

describe('deleteAssetService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('자산을 삭제한다', async () => {
    mockRepos.deleteAsset.mockResolvedValue(true)
    const result = await deleteAssetService('asset_1')
    expect(result.success).toBe(true)
  })

  it('존재하지 않으면 에러를 반환한다', async () => {
    mockRepos.deleteAsset.mockResolvedValue(false)
    const result = await deleteAssetService('none')
    expect(result.success).toBe(false)
  })
})

describe('addValuationService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('평가를 추가한다', async () => {
    mockRepos.findAssetById.mockResolvedValue(mockAsset as any)
    mockRepos.addValuation.mockResolvedValue({ id: 'v1', assetId: 'asset_1', date: '2026-04-15', value: 13000000, source: 'manual', memo: null } as any)

    const result = await addValuationService('asset_1', { date: '2026-04-15', value: 13000000, source: 'manual' })
    expect(result.success).toBe(true)
  })

  it('자산이 없으면 에러를 반환한다', async () => {
    mockRepos.findAssetById.mockResolvedValue(null)
    const result = await addValuationService('none', { date: '2026-04-15', value: 13000000, source: 'manual' })
    expect(result.success).toBe(false)
  })
})

describe('getPortfolioSummaryService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('포트폴리오 요약을 계산한다', async () => {
    mockRepos.findAllAssets.mockResolvedValue([
      { ...mockAsset, id: 'a1', assetCategoryId: 'cat_fin', currentValue: 10000000, acquisitionCost: 8000000 },
      { ...mockAsset, id: 'a2', assetCategoryId: 'cat_fin', currentValue: 5000000, acquisitionCost: 5000000 },
    ] as any)
    mockRepos.findAllAssetCategories.mockResolvedValue([
      { id: 'cat_fin', name: '금융자산', kind: 'financial', icon: null, color: null, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() },
    ] as any)

    const result = await getPortfolioSummaryService()
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.totalAssetValue).toBe(15000000)
      expect(result.data.totalAcquisitionCost).toBe(13000000)
      expect(result.data.totalGain).toBe(2000000)
      expect(result.data.totalReturnRate).toBeCloseTo(15.38, 1)
      expect(result.data.byKind).toHaveLength(1)
      expect(result.data.byKind[0].label).toBe('financial')
      expect(result.data.byKind[0].ratio).toBe(100)
    }
  })

  it('자산이 없으면 0을 반환한다', async () => {
    mockRepos.findAllAssets.mockResolvedValue([])
    mockRepos.findAllAssetCategories.mockResolvedValue([])

    const result = await getPortfolioSummaryService()
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.totalAssetValue).toBe(0)
      expect(result.data.totalReturnRate).toBe(0)
    }
  })
})
