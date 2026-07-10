import { describe, it, expect } from "vitest"

import {
  compoundGrowth,
  findGoalReachYm,
  projectAssetsFromList,
} from "@/lib/forecast/asset-forecast"

describe("compoundGrowth", () => {
  it("월 복리로 미래 가치를 계산한다 (FV = PV × (1 + r/12)^n)", () => {
    // 100만원, 연 12% → 월 1%, 12개월: 1000000 × 1.01^12 = 1126825.03 → 1126825
    expect(compoundGrowth(1000000, 12, 12)).toBe(1126825)
  })

  it("성장률 0이면 현재 가치를 유지한다", () => {
    expect(compoundGrowth(1000000, 0, 24)).toBe(1000000)
  })

  it("음수 성장률은 가치를 감소시킨다", () => {
    const result = compoundGrowth(1000000, -10, 12)
    expect(result).toBeLessThan(1000000)
    expect(result).toBeGreaterThan(0)
  })

  it("0개월이면 현재 가치 그대로다", () => {
    expect(compoundGrowth(1234567, 5, 0)).toBe(1234567)
  })
})

describe("projectAssetsFromList", () => {
  const categoryMap = new Map([
    ["cat-fin", "금융자산"],
    ["cat-re", "부동산"],
    ["cat-car", "차량"],
  ])

  const assets = [
    { id: "a1", name: "예금", currentValue: 10000000, assetCategoryId: "cat-fin" },
    { id: "a2", name: "아파트", currentValue: 500000000, assetCategoryId: "cat-re" },
  ]

  it("카테고리 기본 성장률을 적용한다 (금융자산 5%, 부동산 3%)", () => {
    const { projections } = projectAssetsFromList(assets, 12, null, categoryMap)
    expect(projections[0].growthRate).toBe(5)
    expect(projections[1].growthRate).toBe(3)
    expect(projections[0].projectedValue).toBe(compoundGrowth(10000000, 5, 12))
  })

  it("assumptions.assetGrowthRates가 기본값을 덮어쓴다", () => {
    const { projections } = projectAssetsFromList(
      assets,
      12,
      { assetGrowthRates: { "cat-fin": 10 } },
      categoryMap,
    )
    expect(projections[0].growthRate).toBe(10)
    expect(projections[1].growthRate).toBe(3) // 미지정은 기본값 유지
  })

  it("알 수 없는 카테고리는 성장률 0", () => {
    const { projections } = projectAssetsFromList(
      [{ id: "a3", name: "기타자산", currentValue: 100, assetCategoryId: "unknown" }],
      12,
      null,
      categoryMap,
    )
    expect(projections[0].growthRate).toBe(0)
    expect(projections[0].projectedValue).toBe(100)
  })

  it("총 투영 가치는 개별 투영의 합이다", () => {
    const { totalProjectedValue, projections } = projectAssetsFromList(
      assets,
      6,
      null,
      categoryMap,
    )
    expect(totalProjectedValue).toBe(
      projections.reduce((sum, p) => sum + p.projectedValue, 0),
    )
  })

  it("자산이 없으면 0을 반환한다", () => {
    const { totalProjectedValue, projections } = projectAssetsFromList(
      [],
      12,
      null,
      categoryMap,
    )
    expect(totalProjectedValue).toBe(0)
    expect(projections).toHaveLength(0)
  })
})

describe("findGoalReachYm", () => {
  const series = [
    { ym: "2026-01", projectedNetWorth: 10000000 },
    { ym: "2026-02", projectedNetWorth: 12000000 },
    { ym: "2026-03", projectedNetWorth: 15000000 },
  ]

  it("목표 금액에 처음 도달하는 월을 반환한다", () => {
    expect(findGoalReachYm(series, 12000000)).toBe("2026-02")
  })

  it("첫 달부터 도달했으면 첫 달을 반환한다", () => {
    expect(findGoalReachYm(series, 5000000)).toBe("2026-01")
  })

  it("기간 내 도달하지 못하면 null을 반환한다", () => {
    expect(findGoalReachYm(series, 99999999)).toBeNull()
  })

  it("목표가 0 이하이거나 시리즈가 비면 null을 반환한다", () => {
    expect(findGoalReachYm(series, 0)).toBeNull()
    expect(findGoalReachYm([], 1000)).toBeNull()
  })
})
