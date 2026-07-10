import type { ForecastAssumptions } from "@/types"

import {
  projectAssetsFromList,
  type AssetInput,
} from "./asset-forecast"
import {
  projectCashflow,
  type CashflowInputs,
} from "./cashflow-forecast"

/**
 * 예측 실행 오케스트레이션 — 프레임워크 독립 순수 함수 (API.md §13.6, PRD §3.9).
 * projectCashflow(월별 수입/지출)와 projectAssetsFromList(자산 투영)를 합성해
 * 월별 누적 현금·순자산 시계열을 만든다. DB 접근 없음 — 서비스가 입력을 주입한다.
 */

export interface ForecastSeriesInputs {
  readonly cashflow: CashflowInputs
  /** 실행 시점의 전체 계좌 잔액 합 (account_balances_v) */
  readonly startingBalance: number
  readonly assets: readonly AssetInput[]
  /** asset_category_id → 카테고리 이름 (기본 성장률 매핑용) */
  readonly assetCategoryNames: ReadonlyMap<string, string>
}

export interface ForecastSeriesDetails {
  readonly historicalIncome: number
  readonly historicalExpense: number
  readonly recurringIncome: number
  readonly recurringExpense: number
  readonly projectedAssetTotal: number
}

export interface ForecastSeriesPoint {
  readonly ym: string // YYYY-MM
  readonly projectedIncome: number
  readonly projectedExpense: number
  /** 누적 현금 = 시작 잔액 + Σ(수입-지출) */
  readonly projectedBalance: number
  /** 누적 현금 + 자산 투영 합계 */
  readonly projectedNetWorth: number
  readonly details: ForecastSeriesDetails
}

export function buildForecastSeries(
  startDate: string,
  endDate: string,
  assumptions: ForecastAssumptions | null,
  inputs: ForecastSeriesInputs,
): readonly ForecastSeriesPoint[] {
  const monthly = projectCashflow(startDate, endDate, assumptions, inputs.cashflow)

  let runningBalance = inputs.startingBalance

  return monthly.map((projection, monthIndex) => {
    runningBalance += projection.projectedIncome - projection.projectedExpense

    // monthIndex=0은 실행 시점 현재가치 그대로 (성장 0개월)
    const { totalProjectedValue } = projectAssetsFromList(
      inputs.assets,
      monthIndex,
      assumptions,
      inputs.assetCategoryNames,
    )

    return {
      ym: projection.date.substring(0, 7),
      projectedIncome: projection.projectedIncome,
      projectedExpense: projection.projectedExpense,
      projectedBalance: runningBalance,
      projectedNetWorth: runningBalance + totalProjectedValue,
      details: {
        historicalIncome: projection.historicalIncome,
        historicalExpense: projection.historicalExpense,
        recurringIncome: projection.recurringIncome,
        recurringExpense: projection.recurringExpense,
        projectedAssetTotal: totalProjectedValue,
      },
    }
  })
}
