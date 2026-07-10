import { describe, it, expect } from "vitest"

import {
  averageMonthlyTotals,
  calculateNextDate,
  countOccurrencesInMonth,
  getRecurringForMonth,
  projectCashflow,
  type RecurringItem,
} from "@/lib/forecast/cashflow-forecast"

function recurring(overrides: Partial<RecurringItem> = {}): RecurringItem {
  return {
    type: "expense",
    amount: 100000,
    frequency: "monthly",
    interval: 1,
    nextDate: "2026-06-10",
    startDate: "2026-01-10",
    endDate: null,
    ...overrides,
  }
}

describe("averageMonthlyTotals", () => {
  it("월별 합계 행에서 수입/지출 평균을 계산한다", () => {
    const rows = [
      { type: "income" as const, total: 1000000 },
      { type: "income" as const, total: 2000000 },
      { type: "income" as const, total: 3000000 },
      { type: "expense" as const, total: 500000 },
      { type: "expense" as const, total: 700000 },
    ]
    const result = averageMonthlyTotals(rows)
    expect(result.avgIncome).toBe(2000000)
    expect(result.avgExpense).toBe(600000)
  })

  it("데이터가 없으면 0을 반환한다", () => {
    const result = averageMonthlyTotals([])
    expect(result.avgIncome).toBe(0)
    expect(result.avgExpense).toBe(0)
  })

  it("평균은 반올림한다", () => {
    const rows = [
      { type: "income" as const, total: 100 },
      { type: "income" as const, total: 101 },
      { type: "income" as const, total: 101 },
    ]
    // (100+101+101)/3 = 100.666... → 101
    expect(averageMonthlyTotals(rows).avgIncome).toBe(101)
  })
})

// 레거시 recurring-service.calculateNextDate 이식 (H-5 월말/윤년 보정 포함)
describe("calculateNextDate", () => {
  it("daily: interval일 후", () => {
    expect(calculateNextDate("2026-06-10", "daily", 3)).toBe("2026-06-13")
  })

  it("weekly: interval주 후", () => {
    expect(calculateNextDate("2026-06-10", "weekly", 2)).toBe("2026-06-24")
  })

  it("monthly: interval개월 후", () => {
    expect(calculateNextDate("2026-06-10", "monthly", 1)).toBe("2026-07-10")
  })

  it("monthly: 월말 보정 (1/31 + 1개월 → 2/28)", () => {
    expect(calculateNextDate("2026-01-31", "monthly", 1)).toBe("2026-02-28")
  })

  it("yearly: 윤년 보정 (2028-02-29 + 1년 → 2029-02-28)", () => {
    expect(calculateNextDate("2028-02-29", "yearly", 1)).toBe("2029-02-28")
  })
})

describe("countOccurrencesInMonth", () => {
  it("monthly 정기 거래는 월 1회 발생한다", () => {
    expect(
      countOccurrencesInMonth("2026-06-10", "monthly", 1, "2026-06-01", "2026-06-30"),
    ).toBe(1)
  })

  it("weekly 정기 거래는 월 4~5회 발생한다", () => {
    // 2026-06-01(월)부터 매주 → 6/1, 6/8, 6/15, 6/22, 6/29 = 5회
    expect(
      countOccurrencesInMonth("2026-06-01", "weekly", 1, "2026-06-01", "2026-06-30"),
    ).toBe(5)
  })

  it("daily interval=1은 월 일수만큼 발생한다", () => {
    expect(
      countOccurrencesInMonth("2026-06-01", "daily", 1, "2026-06-01", "2026-06-30"),
    ).toBe(30)
  })

  it("daily interval=7은 주 단위로 발생한다", () => {
    expect(
      countOccurrencesInMonth("2026-06-01", "daily", 7, "2026-06-01", "2026-06-30"),
    ).toBe(5)
  })

  it("nextDate가 월 이후면 0회", () => {
    expect(
      countOccurrencesInMonth("2026-08-10", "monthly", 1, "2026-06-01", "2026-06-30"),
    ).toBe(0)
  })

  it("nextDate가 월 이전이면 앞으로 이동해 발생 횟수를 계산한다", () => {
    expect(
      countOccurrencesInMonth("2026-04-10", "monthly", 1, "2026-06-01", "2026-06-30"),
    ).toBe(1)
  })
})

describe("getRecurringForMonth", () => {
  it("월 내 정기 수입/지출을 합산한다", () => {
    const items = [
      recurring({ type: "income", amount: 3000000, nextDate: "2026-06-25" }),
      recurring({ type: "expense", amount: 500000, nextDate: "2026-06-05" }),
    ]
    const result = getRecurringForMonth("2026-06", items)
    expect(result.recurringIncome).toBe(3000000)
    expect(result.recurringExpense).toBe(500000)
  })

  it("종료일이 월 시작 이전이면 제외한다", () => {
    const items = [recurring({ endDate: "2026-05-31" })]
    const result = getRecurringForMonth("2026-06", items)
    expect(result.recurringExpense).toBe(0)
  })

  it("시작일이 월 끝 이후면 제외한다", () => {
    const items = [recurring({ startDate: "2026-07-01", nextDate: "2026-07-10" })]
    const result = getRecurringForMonth("2026-06", items)
    expect(result.recurringExpense).toBe(0)
  })

  it("weekly는 발생 횟수만큼 곱한다", () => {
    const items = [
      recurring({ amount: 10000, frequency: "weekly", nextDate: "2026-06-01" }),
    ]
    const result = getRecurringForMonth("2026-06", items)
    expect(result.recurringExpense).toBe(50000) // 5회 × 10000
  })
})

describe("projectCashflow", () => {
  const inputs = { avgIncome: 1000000, avgExpense: 500000, recurrings: [] }

  it("기간의 월 수만큼 투영을 생성한다", () => {
    const result = projectCashflow("2026-01-01", "2026-03-31", null, inputs)
    expect(result).toHaveLength(3)
    expect(result[0].date).toBe("2026-01-01")
    expect(result[2].date).toBe("2026-03-01")
  })

  it("가정치가 없으면 평균을 그대로 유지한다", () => {
    const result = projectCashflow("2026-01-01", "2026-03-31", null, inputs)
    for (const month of result) {
      expect(month.projectedIncome).toBe(1000000)
      expect(month.projectedExpense).toBe(500000)
    }
  })

  it("연간 증가율을 월할 복리로 적용한다 (레거시 수식 회귀)", () => {
    // 연 12% → 월 1%: m0 ×1.00, m1 ×1.01, m2 ×1.01^2
    const result = projectCashflow(
      "2026-01-01",
      "2026-03-31",
      { incomeGrowthRate: 12, expenseGrowthRate: 12 },
      inputs,
    )
    expect(result[0].projectedIncome).toBe(1000000)
    expect(result[1].projectedIncome).toBe(1010000)
    expect(result[2].projectedIncome).toBe(1020100)
    expect(result[0].projectedExpense).toBe(500000)
    expect(result[1].projectedExpense).toBe(505000)
    expect(result[2].projectedExpense).toBe(510050)
  })

  it("연도 경계를 넘는 기간을 처리한다", () => {
    const result = projectCashflow("2026-11-01", "2027-02-28", null, inputs)
    expect(result.map((m) => m.date)).toEqual([
      "2026-11-01",
      "2026-12-01",
      "2027-01-01",
      "2027-02-01",
    ])
  })

  it("정기 거래를 이력 평균에 더한다", () => {
    const result = projectCashflow("2026-06-01", "2026-06-30", null, {
      ...inputs,
      recurrings: [
        recurring({ type: "income", amount: 3000000, nextDate: "2026-06-25" }),
      ],
    })
    expect(result[0].projectedIncome).toBe(4000000) // 1000000 + 3000000
    expect(result[0].recurringIncome).toBe(3000000)
    expect(result[0].historicalIncome).toBe(1000000)
  })

  it("음수 증가율(감소)을 적용한다", () => {
    const result = projectCashflow(
      "2026-01-01",
      "2026-02-28",
      { expenseGrowthRate: -12 },
      inputs,
    )
    expect(result[1].projectedExpense).toBe(495000) // 500000 × 0.99
  })
})
