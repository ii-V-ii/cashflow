import { findAllAssets, findAllAssetCategories } from '@/db/repositories'
import type { ForecastAssumptions, AssetProjection } from '@/types'

/**
 * 자산 카테고리별 기본 성장률 (연간 %)
 * 카테고리 이름 기반으로 매핑
 */
const DEFAULT_GROWTH_RATES: Record<string, number> = {
  '금융자산': 5,
  '부동산': 3,
  '차량': -10,
  '보험/연금': 3,
  '기타': 0,
}

/**
 * 복리 계산: FV = PV * (1 + r/12)^months
 */
export function compoundGrowth(
  currentValue: number,
  annualRate: number,
  months: number,
): number {
  const monthlyRate = annualRate / 100 / 12
  return Math.round(currentValue * Math.pow(1 + monthlyRate, months))
}

/**
 * 자산 목록으로부터 투영 계산 (순수 함수 - DB 호출 없음)
 * categoryMap: assetCategoryId -> 카테고리 이름
 */
export function projectAssetsFromList(
  activeAssets: readonly { id: string; name: string; currentValue: number; assetCategoryId: string }[],
  months: number,
  assumptions: ForecastAssumptions | null,
  categoryMap: ReadonlyMap<string, string>,
): {
  totalProjectedValue: number
  projections: readonly AssetProjection[]
} {
  const customRates = assumptions?.assetGrowthRates ?? {}

  const projections: AssetProjection[] = activeAssets.map((asset) => {
    const categoryName = categoryMap.get(asset.assetCategoryId) ?? '기타'
    const growthRate = customRates[asset.assetCategoryId] ?? DEFAULT_GROWTH_RATES[categoryName] ?? 0
    const projectedValue = compoundGrowth(asset.currentValue, growthRate, months)

    return {
      assetId: asset.id,
      assetName: asset.name,
      currentValue: asset.currentValue,
      projectedValue,
      growthRate,
    }
  })

  const totalProjectedValue = projections.reduce((sum, p) => sum + p.projectedValue, 0)
  return { totalProjectedValue, projections }
}

/**
 * 특정 시점의 자산 포트폴리오 투영
 */
export async function projectAssets(
  months: number,
  assumptions: ForecastAssumptions | null,
): Promise<{
  totalProjectedValue: number
  projections: readonly AssetProjection[]
}> {
  const activeAssets = await findAllAssets(true)
  const allCategories = await findAllAssetCategories()
  const categoryMap = new Map(allCategories.map(c => [c.id, c.name]))
  return projectAssetsFromList(activeAssets, months, assumptions, categoryMap)
}

/**
 * 순자산 투영: 계좌 잔액 + 자산 가치
 */
export async function projectNetWorth(
  currentBalance: number,
  months: number,
  assumptions: ForecastAssumptions | null,
): Promise<number> {
  const { totalProjectedValue } = await projectAssets(months, assumptions)
  return currentBalance + totalProjectedValue
}
