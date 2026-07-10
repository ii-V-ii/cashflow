import { describe, expect, test } from "vitest"

import { buildForecastSeries } from "@/lib/forecast/forecast-series"
import { projectCashflow } from "@/lib/forecast/cashflow-forecast"

/**
 * buildForecastSeries — run 오케스트레이션 순수 함수 (API.md §13.6).
 * projectCashflow(월별 수입/지출) + 누적 현금 + 자산 투영(projectAssetsFromList)을
 * 하나의 월별 시계열로 합성한다. DB 접근 없음 — 입력 주입.
 */

const NO_ASSETS = {
  assets: [],
  assetCategoryNames: new Map<string, string>(),
}

describe("buildForecastSeries", () => {
  test("성장률·정기·자산 없음 — 누적 현금 = 시작 잔액 + Σ(수입-지출)", () => {
    // Arrange
    const inputs = {
      cashflow: { avgIncome: 100, avgExpense: 60, recurrings: [] },
      startingBalance: 1_000,
      ...NO_ASSETS,
    }

    // Act
    const series = buildForecastSeries("2026-01-01", "2026-03-31", null, inputs)

    // Assert
    expect(series).toHaveLength(3)
    expect(series.map((point) => point.ym)).toEqual(["2026-01", "2026-02", "2026-03"])
    expect(series.map((point) => point.projectedIncome)).toEqual([100, 100, 100])
    expect(series.map((point) => point.projectedExpense)).toEqual([60, 60, 60])
    expect(series.map((point) => point.projectedBalance)).toEqual([1_040, 1_080, 1_120])
    // 자산 없음 → 순자산 = 누적 현금
    expect(series.map((point) => point.projectedNetWorth)).toEqual([
      1_040, 1_080, 1_120,
    ])
  })

  test("연도 경계를 넘는 ym 시퀀스", () => {
    const inputs = {
      cashflow: { avgIncome: 0, avgExpense: 0, recurrings: [] },
      startingBalance: 0,
      ...NO_ASSETS,
    }

    const series = buildForecastSeries("2026-11-01", "2027-02-28", null, inputs)

    expect(series.map((point) => point.ym)).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ])
  })

  test("자산 투영 — 첫 달은 현재가치, 이후 월복리 성장 반영", () => {
    const categoryId = "11111111-1111-1111-1111-111111111111"
    const inputs = {
      cashflow: { avgIncome: 0, avgExpense: 0, recurrings: [] },
      startingBalance: 500,
      assets: [
        {
          id: "a1",
          name: "펀드",
          currentValue: 12_000,
          assetCategoryId: categoryId,
        },
      ],
      assetCategoryNames: new Map([[categoryId, "금융자산"]]),
    }
    // 연 12% → 월 1% 복리
    const assumptions = { assetGrowthRates: { [categoryId]: 12 } }

    const series = buildForecastSeries("2026-01-01", "2026-03-31", assumptions, inputs)

    // monthIndex=0 → (1.01)^0 = 현재가치 그대로
    expect(series[0].projectedNetWorth).toBe(500 + 12_000)
    expect(series[1].projectedNetWorth).toBe(500 + Math.round(12_000 * 1.01))
    expect(series[2].projectedNetWorth).toBe(500 + Math.round(12_000 * 1.01 ** 2))
  })

  test("월별 수입/지출은 projectCashflow와 동일 (수식 회귀)", () => {
    const cashflow = {
      avgIncome: 3_000_000,
      avgExpense: 2_000_000,
      recurrings: [
        {
          type: "income" as const,
          amount: 500_000,
          frequency: "monthly" as const,
          interval: 1,
          nextDate: "2026-01-25",
          startDate: "2025-01-25",
          endDate: null,
        },
      ],
    }
    const assumptions = { incomeGrowthRate: 5, expenseGrowthRate: 3 }

    const series = buildForecastSeries("2026-01-01", "2026-06-30", assumptions, {
      cashflow,
      startingBalance: 0,
      ...NO_ASSETS,
    })
    const expected = projectCashflow("2026-01-01", "2026-06-30", assumptions, cashflow)

    expect(series).toHaveLength(expected.length)
    for (const [index, point] of series.entries()) {
      expect(point.projectedIncome).toBe(expected[index].projectedIncome)
      expect(point.projectedExpense).toBe(expected[index].projectedExpense)
    }
  })

  test("details에 이력/정기 분해와 자산 합계를 담는다 (스냅샷 근거 보존)", () => {
    const inputs = {
      cashflow: {
        avgIncome: 100,
        avgExpense: 50,
        recurrings: [
          {
            type: "expense" as const,
            amount: 10,
            frequency: "monthly" as const,
            interval: 1,
            nextDate: "2026-01-05",
            startDate: "2025-06-05",
            endDate: null,
          },
        ],
      },
      startingBalance: 0,
      ...NO_ASSETS,
    }

    const [first] = buildForecastSeries("2026-01-01", "2026-01-31", null, inputs)

    expect(first.details).toEqual({
      historicalIncome: 100,
      historicalExpense: 50,
      recurringIncome: 0,
      recurringExpense: 10,
      projectedAssetTotal: 0,
    })
    expect(first.projectedExpense).toBe(60)
  })
})
