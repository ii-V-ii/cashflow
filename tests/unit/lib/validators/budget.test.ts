import { describe, expect, test } from "vitest"

import {
  annualGridQuerySchema,
  budgetsListQuerySchema,
  budgetActualsQuerySchema,
  copyBudgetSchema,
  createBudgetSchema,
  updateAnnualGridCellSchema,
  updateBudgetSchema,
} from "@/lib/validators"

const CATEGORY_ID = "3f2f2b6a-9c3e-4b1f-8d5e-2a1b3c4d5e6f"
const CATEGORY_ID_2 = "4a3b2c1d-0e9f-4a8b-9c7d-6e5f4a3b2c1d"

describe("createBudgetSchema", () => {
  test("accepts a monthly budget with items", () => {
    // Arrange
    const input = {
      name: "2026년 7월 예산",
      year: 2026,
      month: 7,
      memo: null,
      items: [
        { categoryId: CATEGORY_ID, plannedAmount: 500000 },
        { categoryId: CATEGORY_ID_2, plannedAmount: 0, memo: "저축" },
      ],
    }

    // Act
    const parsed = createBudgetSchema.parse(input)

    // Assert
    expect(parsed.year).toBe(2026)
    expect(parsed.month).toBe(7)
    expect(parsed.items).toHaveLength(2)
  })

  test("accepts an annual budget (month omitted or null)", () => {
    expect(
      createBudgetSchema.parse({ name: "2026 연간", year: 2026 }).month,
    ).toBeUndefined()
    expect(
      createBudgetSchema.parse({ name: "2026 연간", year: 2026, month: null })
        .month,
    ).toBeNull()
  })

  test("rejects out-of-range year and month", () => {
    expect(
      createBudgetSchema.safeParse({ name: "x", year: 1999, month: 1 }).success,
    ).toBe(false)
    expect(
      createBudgetSchema.safeParse({ name: "x", year: 2026, month: 13 }).success,
    ).toBe(false)
    expect(
      createBudgetSchema.safeParse({ name: "x", year: 2026, month: 0 }).success,
    ).toBe(false)
  })

  test("rejects empty name and negative planned amount", () => {
    expect(
      createBudgetSchema.safeParse({ name: "", year: 2026, month: 1 }).success,
    ).toBe(false)
    expect(
      createBudgetSchema.safeParse({
        name: "x",
        year: 2026,
        month: 1,
        items: [{ categoryId: CATEGORY_ID, plannedAmount: -1 }],
      }).success,
    ).toBe(false)
  })

  test("rejects duplicate categoryId in items", () => {
    const result = createBudgetSchema.safeParse({
      name: "x",
      year: 2026,
      month: 1,
      items: [
        { categoryId: CATEGORY_ID, plannedAmount: 1000 },
        { categoryId: CATEGORY_ID, plannedAmount: 2000 },
      ],
    })
    expect(result.success).toBe(false)
  })
})

describe("updateBudgetSchema", () => {
  test("accepts partial updates and full item replacement", () => {
    const parsed = updateBudgetSchema.parse({
      name: "이름 변경",
      items: [{ categoryId: CATEGORY_ID, plannedAmount: 10000 }],
    })
    expect(parsed.name).toBe("이름 변경")
    expect(parsed.items).toHaveLength(1)
  })

  test("accepts empty items array (전량 삭제)", () => {
    expect(updateBudgetSchema.parse({ items: [] }).items).toEqual([])
  })

  test("rejects duplicate categoryId in items", () => {
    expect(
      updateBudgetSchema.safeParse({
        items: [
          { categoryId: CATEGORY_ID, plannedAmount: 1 },
          { categoryId: CATEGORY_ID, plannedAmount: 2 },
        ],
      }).success,
    ).toBe(false)
  })
})

describe("copyBudgetSchema", () => {
  test("accepts a source→target month pair", () => {
    const parsed = copyBudgetSchema.parse({
      sourceYear: 2026,
      sourceMonth: 6,
      targetYear: 2026,
      targetMonth: 7,
    })
    expect(parsed.targetMonth).toBe(7)
  })

  test("rejects same source and target", () => {
    expect(
      copyBudgetSchema.safeParse({
        sourceYear: 2026,
        sourceMonth: 7,
        targetYear: 2026,
        targetMonth: 7,
      }).success,
    ).toBe(false)
  })
})

describe("query schemas", () => {
  test("budgetsListQuerySchema coerces year string", () => {
    expect(budgetsListQuerySchema.parse({ year: "2026" }).year).toBe(2026)
    expect(budgetsListQuerySchema.safeParse({}).success).toBe(false)
  })

  test("budgetActualsQuerySchema requires year and month", () => {
    const parsed = budgetActualsQuerySchema.parse({ year: "2026", month: "7" })
    expect(parsed).toEqual({ year: 2026, month: 7 })
    expect(budgetActualsQuerySchema.safeParse({ year: "2026" }).success).toBe(
      false,
    )
    expect(
      budgetActualsQuerySchema.safeParse({ year: "2026", month: "13" }).success,
    ).toBe(false)
  })

  test("annualGridQuerySchema accepts optional type/expenseKind filters", () => {
    const parsed = annualGridQuerySchema.parse({
      year: "2026",
      type: "expense",
      expenseKind: "saving",
    })
    expect(parsed).toEqual({ year: 2026, type: "expense", expenseKind: "saving" })
    expect(
      annualGridQuerySchema.safeParse({ year: "2026", type: "transfer" }).success,
    ).toBe(false)
  })
})

describe("updateAnnualGridCellSchema", () => {
  test("accepts a zero amount (셀 비우기 = 항목 삭제)", () => {
    const parsed = updateAnnualGridCellSchema.parse({
      year: 2026,
      month: 7,
      categoryId: CATEGORY_ID,
      amount: 0,
    })
    expect(parsed.amount).toBe(0)
  })

  test("rejects negative amount and invalid month", () => {
    expect(
      updateAnnualGridCellSchema.safeParse({
        year: 2026,
        month: 7,
        categoryId: CATEGORY_ID,
        amount: -1,
      }).success,
    ).toBe(false)
    expect(
      updateAnnualGridCellSchema.safeParse({
        year: 2026,
        month: 0,
        categoryId: CATEGORY_ID,
        amount: 100,
      }).success,
    ).toBe(false)
  })
})
