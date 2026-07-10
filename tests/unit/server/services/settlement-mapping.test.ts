import { describe, expect, test } from "vitest"

import {
  mapAnnualSettlement,
  mapMonthlySettlement,
  type RawAnnualSettlement,
  type RawMonthlySettlement,
} from "@/server/services/settlement-mapping"

/** get_monthly_settlement RPC(DB.md §3.10) 원형 → API.md §7.1 DTO 매핑 */

const RAW_MONTHLY: RawMonthlySettlement = {
  year: 2026,
  month: 7,
  total_income: 500_000,
  total_expense: 170_000,
  net_income: 330_000,
  income_by_category: [
    { category_id: "cat-salary", category_name: "급여", amount: 500_000 },
  ],
  expense_by_category: [
    {
      category_id: "cat-food",
      category_name: "식비",
      expense_kind: "consumption",
      amount: 120_000,
    },
    {
      category_id: "cat-saving",
      category_name: "저축",
      expense_kind: "saving",
      amount: 50_000,
    },
  ],
  account_changes: [
    {
      account_id: "acc-bank",
      name: "은행",
      opening_balance: 100_000,
      income: 500_000,
      expense: 170_000,
      closing_balance: 430_000,
    },
  ],
  previous_month: { income: 400_000, expense: 200_000, net: 200_000 },
}

describe("mapMonthlySettlement", () => {
  test("합계·순수익·전월 대비 diff를 매핑한다", () => {
    const dto = mapMonthlySettlement(RAW_MONTHLY)

    expect(dto.year).toBe(2026)
    expect(dto.month).toBe(7)
    expect(dto.income.total).toBe(500_000)
    expect(dto.expense.total).toBe(170_000)
    expect(dto.net).toBe(330_000)
    expect(dto.momComparison).toEqual({
      incomeDiff: 100_000,
      expenseDiff: -30_000,
      netDiff: 130_000,
    })
  })

  test("저축/소비 분리 합계 — 저축 거래가 지출에 포함된다 (PRD §5 규칙 1)", () => {
    const dto = mapMonthlySettlement(RAW_MONTHLY)

    expect(dto.expense.consumptionTotal).toBe(120_000)
    expect(dto.expense.savingTotal).toBe(50_000)
    expect(dto.expense.total).toBe(
      dto.expense.consumptionTotal + dto.expense.savingTotal,
    )
  })

  test("카테고리 구성비(ratio)는 해당 유형 합계 대비 백분율이다", () => {
    const dto = mapMonthlySettlement(RAW_MONTHLY)

    expect(dto.income.byCategory[0]).toMatchObject({
      categoryId: "cat-salary",
      name: "급여",
      amount: 500_000,
      ratio: 100,
    })
    const food = dto.expense.byCategory.find((c) => c.categoryId === "cat-food")
    expect(food?.expenseKind).toBe("consumption")
    expect(food?.ratio).toBeCloseTo((120_000 / 170_000) * 100, 1)
  })

  test("계좌별 변동 change = closing - opening", () => {
    const dto = mapMonthlySettlement(RAW_MONTHLY)

    expect(dto.accounts[0]).toEqual({
      accountId: "acc-bank",
      name: "은행",
      openingBalance: 100_000,
      closingBalance: 430_000,
      change: 330_000,
    })
  })

  test("거래 없는 월 — null 배열·0 합계를 빈 값으로 정규화한다", () => {
    const dto = mapMonthlySettlement({
      year: 2026,
      month: 1,
      total_income: 0,
      total_expense: 0,
      net_income: 0,
      income_by_category: null,
      expense_by_category: null,
      account_changes: null,
      previous_month: { income: 0, expense: 0, net: 0 },
    })

    expect(dto.income.byCategory).toEqual([])
    expect(dto.expense.byCategory).toEqual([])
    expect(dto.accounts).toEqual([])
    expect(dto.expense.consumptionTotal).toBe(0)
    expect(dto.expense.savingTotal).toBe(0)
  })
})

/** 연간 결산 집계(API.md §7.2) 매핑 */

const RAW_ANNUAL: RawAnnualSettlement = {
  year: 2026,
  months: Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    income: i === 6 ? 500_000 : 0,
    expense: i === 6 ? 170_000 : 0,
    saving: i === 6 ? 50_000 : 0,
  })),
  by_category: [
    {
      category_id: "cat-salary",
      category_name: "급여",
      type: "income",
      expense_kind: null,
      amount: 500_000,
    },
    {
      category_id: "cat-food",
      category_name: "식비",
      type: "expense",
      expense_kind: "consumption",
      amount: 120_000,
    },
    {
      category_id: "cat-saving",
      category_name: "저축",
      type: "expense",
      expense_kind: "saving",
      amount: 50_000,
    },
  ],
}

describe("mapAnnualSettlement", () => {
  test("12개월 행과 net을 만든다", () => {
    const dto = mapAnnualSettlement(RAW_ANNUAL)

    expect(dto.year).toBe(2026)
    expect(dto.months).toHaveLength(12)
    expect(dto.months[6]).toEqual({
      month: 7,
      income: 500_000,
      expense: 170_000,
      saving: 50_000,
      net: 330_000,
    })
    expect(dto.months[0].net).toBe(0)
  })

  test("연간 합계(저축 포함 지출)를 집계한다", () => {
    const dto = mapAnnualSettlement(RAW_ANNUAL)

    expect(dto.total).toEqual({
      income: 500_000,
      expense: 170_000,
      saving: 50_000,
      net: 330_000,
    })
  })

  test("카테고리 ratio는 같은 type 합계 대비 백분율이다", () => {
    const dto = mapAnnualSettlement(RAW_ANNUAL)

    const salary = dto.byCategory.find((c) => c.categoryId === "cat-salary")
    const food = dto.byCategory.find((c) => c.categoryId === "cat-food")
    expect(salary?.ratio).toBe(100)
    expect(food?.ratio).toBeCloseTo((120_000 / 170_000) * 100, 1)
  })

  test("빈 연도 — null 배열 정규화 + 0 합계", () => {
    const dto = mapAnnualSettlement({ year: 2025, months: null, by_category: null })

    expect(dto.months).toHaveLength(12)
    expect(dto.months.every((m) => m.income === 0 && m.expense === 0)).toBe(true)
    expect(dto.byCategory).toEqual([])
    expect(dto.total).toEqual({ income: 0, expense: 0, saving: 0, net: 0 })
  })
})
