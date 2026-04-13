import { findAllAssets } from '@/db/repositories'
import type { ForecastAssumptions, AssetProjection } from '@/types'

/**
 * 자산 유형별 기본 성장률 (연간 %)
 */
const DEFAULT_GROWTH_RATES: Record<string, number> = {
  real_estate: 3,
  vehicle: -10,
  stock: 7,
  fund: 5,
  deposit: 3,
  savings: 3,
  bond: 4,
  crypto: 0,
  insurance: 2,
  pension: 4,
  other: 0,
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
 * M-10: 루프 밖에서 자산을 한번 조회 후 이 함수에 전달
 */
export function projectAssetsFromList(
  activeAssets: readonly { id: string; name: string; currentValue: number; type: string }[],
  months: number,
  assumptions: ForecastAssumptions | null,
): {
  totalProjectedValue: number
  projections: readonly AssetProjection[]
} {
  const customRates = assumptions?.assetGrowthRates ?? {}

  const projections: AssetProjection[] = activeAssets.map((asset) => {
    const growthRate = customRates[asset.type] ?? DEFAULT_GROWTH_RATES[asset.type] ?? 0
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
  return projectAssetsFromList(activeAssets, months, assumptions)
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
