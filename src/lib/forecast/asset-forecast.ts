import type { ForecastAssumptions } from "@/types"

/**
 * 자산 성장 예측 — 프레임워크 독립 순수 함수 (API.md §13, PRD §3.9).
 * 레거시 main:src/lib/forecast/asset-forecast.ts 이식 (DB 접근 함수 제거, 순수부만).
 */

/**
 * 자산 카테고리별 기본 성장률 (연간 %) — 카테고리 이름 기반 매핑
 */
const DEFAULT_GROWTH_RATES: Record<string, number> = {
  금융자산: 5,
  부동산: 3,
  차량: -10,
  "보험/연금": 3,
  기타: 0,
}

export interface AssetProjection {
  readonly assetId: string
  readonly assetName: string
  readonly currentValue: number
  readonly projectedValue: number
  readonly growthRate: number
}

export interface AssetInput {
  readonly id: string
  readonly name: string
  readonly currentValue: number
  readonly assetCategoryId: string
}

/**
 * 복리 계산: FV = PV × (1 + r/12)^months
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
 * 자산 목록의 미래 가치 투영.
 * 성장률 우선순위: assumptions.assetGrowthRates[categoryId] > 카테고리 이름 기본값 > 0
 */
export function projectAssetsFromList(
  activeAssets: readonly AssetInput[],
  months: number,
  assumptions: ForecastAssumptions | null,
  categoryMap: ReadonlyMap<string, string>,
): {
  totalProjectedValue: number
  projections: readonly AssetProjection[]
} {
  const customRates = assumptions?.assetGrowthRates ?? {}

  const projections: AssetProjection[] = activeAssets.map((asset) => {
    const categoryName = categoryMap.get(asset.assetCategoryId) ?? "기타"
    const growthRate =
      customRates[asset.assetCategoryId] ?? DEFAULT_GROWTH_RATES[categoryName] ?? 0
    const projectedValue = compoundGrowth(asset.currentValue, growthRate, months)

    return {
      assetId: asset.id,
      assetName: asset.name,
      currentValue: asset.currentValue,
      projectedValue,
      growthRate,
    }
  })

  const totalProjectedValue = projections.reduce(
    (sum, projection) => sum + projection.projectedValue,
    0,
  )
  return { totalProjectedValue, projections }
}

export interface NetWorthPoint {
  readonly ym: string // YYYY-MM
  readonly projectedNetWorth: number
}

/**
 * 목표 금액에 처음 도달하는 월(YYYY-MM) — 도달하지 못하면 null (PRD §3.9)
 */
export function findGoalReachYm(
  series: readonly NetWorthPoint[],
  goalAmount: number,
): string | null {
  if (goalAmount <= 0) return null
  const reached = series.find((point) => point.projectedNetWorth >= goalAmount)
  return reached?.ym ?? null
}
