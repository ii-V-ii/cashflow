import {
  findAllAssets,
  findAssetById,
  findAssetsByAssetCategoryKind,
  findAllAssetCategories,
  createAsset,
  updateAsset,
  deleteAsset,
  getValuations,
  addValuation,
} from '@/db/repositories'
import { createAssetSchema, updateAssetSchema, createValuationSchema } from '@/lib/validators'
import { successResponse, errorResponse } from '@/lib/api-response'
import {
  calculateSimpleReturn,
  calculatePortfolioWeight,
} from '@/lib/calculations/investment-calculator'
import type { ApiResponse, PortfolioSummary, PortfolioGroup, AssetWithValuations } from '@/types'

export async function getAssetsService(params?: {
  kind?: string
  activeOnly?: boolean
}): Promise<ApiResponse<Awaited<ReturnType<typeof findAllAssets>>>> {
  if (params?.kind) {
    const k = params.kind as 'financial' | 'non_financial'
    return successResponse(await findAssetsByAssetCategoryKind(k))
  }
  return successResponse(await findAllAssets(params?.activeOnly ?? true))
}

export async function getAssetByIdService(id: string): Promise<ApiResponse<Awaited<ReturnType<typeof findAssetById>>>> {
  const asset = await findAssetById(id)
  if (!asset) {
    return errorResponse('NOT_FOUND', '자산을 찾을 수 없습니다')
  }
  return successResponse(asset)
}

export async function getAssetWithValuationsService(id: string): Promise<ApiResponse<AssetWithValuations>> {
  const asset = await findAssetById(id)
  if (!asset) {
    return errorResponse('NOT_FOUND', '자산을 찾을 수 없습니다')
  }
  const valuations = await getValuations(id)
  return successResponse({
    ...asset,
    metadata: (asset.metadata as Record<string, unknown>) ?? null,
    valuations,
  })
}

export async function createAssetService(input: unknown): Promise<ApiResponse<Awaited<ReturnType<typeof findAssetById>>>> {
  const parsed = createAssetSchema.safeParse(input)
  if (!parsed.success) {
    return errorResponse('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다')
  }
  const asset = await createAsset(parsed.data)
  return successResponse(asset)
}

export async function updateAssetService(
  id: string,
  input: unknown,
): Promise<ApiResponse<Awaited<ReturnType<typeof findAssetById>>>> {
  const parsed = updateAssetSchema.safeParse(input)
  if (!parsed.success) {
    return errorResponse('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다')
  }
  const asset = await updateAsset(id, parsed.data)
  if (!asset) {
    return errorResponse('NOT_FOUND', '자산을 찾을 수 없습니다')
  }
  return successResponse(asset)
}

export async function deleteAssetService(id: string): Promise<ApiResponse<{ deleted: true }>> {
  const deleted = await deleteAsset(id)
  if (!deleted) {
    return errorResponse('NOT_FOUND', '자산을 찾을 수 없습니다')
  }
  return successResponse({ deleted: true })
}

export async function addValuationService(
  assetId: string,
  input: unknown,
): Promise<ApiResponse<Awaited<ReturnType<typeof addValuation>>>> {
  const asset = await findAssetById(assetId)
  if (!asset) {
    return errorResponse('NOT_FOUND', '자산을 찾을 수 없습니다')
  }

  const parsed = createValuationSchema.safeParse(input)
  if (!parsed.success) {
    return errorResponse('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다')
  }

  const valuation = await addValuation(assetId, parsed.data)
  return successResponse(valuation)
}

export async function getValuationsService(
  assetId: string,
): Promise<ApiResponse<Awaited<ReturnType<typeof getValuations>>>> {
  const asset = await findAssetById(assetId)
  if (!asset) {
    return errorResponse('NOT_FOUND', '자산을 찾을 수 없습니다')
  }
  return successResponse(await getValuations(assetId))
}

export async function getPortfolioSummaryService(): Promise<ApiResponse<PortfolioSummary>> {
  const allAssets = await findAllAssets(true)
  const allCategories = await findAllAssetCategories()

  const categoryMap = new Map(allCategories.map(c => [c.id, c]))

  const totalAssetValue = allAssets.reduce((sum, a) => sum + a.currentValue, 0)
  const totalAcquisitionCost = allAssets.reduce((sum, a) => sum + a.acquisitionCost, 0)
  const totalGain = totalAssetValue - totalAcquisitionCost
  const totalReturnRate = calculateSimpleReturn(totalAssetValue, totalAcquisitionCost)

  // kind별 그룹 (financial / non_financial)
  const kindGroups = groupAssetsByKind(allAssets, categoryMap, totalAssetValue)
  // 자산 카테고리별 그룹 (금융자산, 부동산, 차량, ...)
  const assetCategoryGroups = groupAssetsByCategory(allAssets, categoryMap, totalAssetValue)

  return successResponse({
    totalAssetValue,
    totalAcquisitionCost,
    totalGain,
    totalReturnRate: Math.round(totalReturnRate * 100) / 100,
    byKind: kindGroups,
    byAssetCategory: assetCategoryGroups,
  })
}

function groupAssetsByKind(
  assetList: Awaited<ReturnType<typeof findAllAssets>>,
  categoryMap: Map<string, { kind: string; name: string }>,
  totalValue: number,
): readonly PortfolioGroup[] {
  const groups = new Map<string, { value: number; count: number }>()

  for (const asset of assetList) {
    const category = categoryMap.get(asset.assetCategoryId)
    const kind = category?.kind ?? 'financial'
    const existing = groups.get(kind) ?? { value: 0, count: 0 }
    groups.set(kind, {
      value: existing.value + asset.currentValue,
      count: existing.count + 1,
    })
  }

  return Array.from(groups.entries())
    .map(([label, { value, count }]) => ({
      label,
      value,
      ratio: Math.round(calculatePortfolioWeight(value, totalValue) * 100) / 100,
      count,
    }))
    .sort((a, b) => b.value - a.value)
}

function groupAssetsByCategory(
  assetList: Awaited<ReturnType<typeof findAllAssets>>,
  categoryMap: Map<string, { kind: string; name: string }>,
  totalValue: number,
): readonly PortfolioGroup[] {
  const groups = new Map<string, { value: number; count: number }>()

  for (const asset of assetList) {
    const category = categoryMap.get(asset.assetCategoryId)
    const label = category?.name ?? '미분류'
    const existing = groups.get(label) ?? { value: 0, count: 0 }
    groups.set(label, {
      value: existing.value + asset.currentValue,
      count: existing.count + 1,
    })
  }

  return Array.from(groups.entries())
    .map(([label, { value, count }]) => ({
      label,
      value,
      ratio: Math.round(calculatePortfolioWeight(value, totalValue) * 100) / 100,
      count,
    }))
    .sort((a, b) => b.value - a.value)
}
