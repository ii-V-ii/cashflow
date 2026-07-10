import { describe, expect, test } from "vitest"

import {
  baselineDraft,
  budgetGroupOf,
  buildMonthlyRows,
  draftTotals,
  isDraftDirty,
  toItemsInput,
} from "@/features/budgets/lib/monthly-editor"
import type {
  BudgetActualCategoryDto,
  BudgetDetailDto,
  CategoryDto,
} from "@/types/api"

function category(overrides: Partial<CategoryDto> & { id: string; name: string }): CategoryDto {
  return {
    type: "expense",
    expenseKind: "consumption",
    icon: null,
    color: null,
    parentId: null,
    sortOrder: 0,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  }
}

const food = category({ id: "food", name: "식비", sortOrder: 0 })
const dining = category({ id: "dining", name: "외식", parentId: "food", sortOrder: 0 })
const saving = category({ id: "saving", name: "저축", expenseKind: "saving", sortOrder: 1 })
const salary = category({ id: "salary", name: "급여", type: "income", expenseKind: null })
const categories = [food, dining, saving, salary]

function detailWith(
  items: { categoryId: string; plannedAmount: number; actualAmount?: number }[],
): BudgetDetailDto {
  return {
    id: "b1",
    name: "3월",
    year: 2026,
    month: 3,
    memo: null,
    items: items.map((item, index) => ({
      id: `item-${index}`,
      categoryId: item.categoryId,
      category: {
        id: item.categoryId,
        name: item.categoryId,
        type: "expense",
        icon: null,
        color: null,
        expenseKind: "consumption",
        parentId: null,
      },
      plannedAmount: item.plannedAmount,
      memo: null,
      actualAmount: item.actualAmount ?? 0,
    })),
    plannedTotal: 0,
    actualTotal: 0,
  }
}

describe("budgetGroupOf", () => {
  test("수입/소비/저축 구분 (저축 = expenseKind saving)", () => {
    expect(budgetGroupOf("income", null)).toBe("income")
    expect(budgetGroupOf("expense", "consumption")).toBe("consumption")
    expect(budgetGroupOf("expense", "saving")).toBe("saving")
  })
})

describe("buildMonthlyRows", () => {
  test("카테고리 전체를 행으로, 계획·실적을 categoryId로 병합", () => {
    const detail = detailWith([{ categoryId: "food", plannedAmount: 300000 }])
    const actuals: BudgetActualCategoryDto[] = [
      {
        categoryId: "food",
        categoryName: "식비",
        type: "expense",
        expenseKind: "consumption",
        planned: 300000,
        actual: 80000,
        ratio: 26.7,
      },
    ]

    const rows = buildMonthlyRows(categories, detail, actuals)

    const foodRow = rows.find((row) => row.categoryId === "food")
    expect(foodRow).toMatchObject({ planned: 300000, actual: 80000, group: "consumption" })
    // 계획·실적 없는 카테고리도 0으로 표시(0원 초기화 그리드)
    expect(rows.find((row) => row.categoryId === "saving")).toMatchObject({
      planned: 0,
      actual: 0,
      group: "saving",
    })
  })

  test("카테고리 목록에 없는 실적(미분류)은 읽기 전용 행으로 추가", () => {
    const actuals: BudgetActualCategoryDto[] = [
      {
        categoryId: null,
        categoryName: "미분류",
        type: "expense",
        expenseKind: null,
        planned: 0,
        actual: 15000,
        ratio: null,
      },
    ]

    const rows = buildMonthlyRows(categories, null, actuals)
    const uncategorized = rows.find((row) => row.categoryId === null)
    expect(uncategorized).toMatchObject({ actual: 15000, readonly: true })
  })

  test("소분류는 부모 아래에 정렬된다", () => {
    const rows = buildMonthlyRows(categories, null, [])
    const ids = rows.map((row) => row.categoryId)
    expect(ids.indexOf("dining")).toBe(ids.indexOf("food") + 1)
  })
})

describe("draft 상태", () => {
  test("baselineDraft는 항목 금액, 없으면 0", () => {
    const detail = detailWith([{ categoryId: "food", plannedAmount: 300000 }])
    const draft = baselineDraft(categories, detail)
    expect(draft.food).toBe(300000)
    expect(draft.saving).toBe(0)
  })

  test("isDraftDirty는 금액 변경 시 true", () => {
    const baseline = { food: 300000, saving: 0 }
    expect(isDraftDirty({ ...baseline }, baseline)).toBe(false)
    expect(isDraftDirty({ ...baseline, saving: 1000 }, baseline)).toBe(true)
  })

  test("toItemsInput은 0원 항목을 제외한다", () => {
    expect(toItemsInput({ food: 300000, saving: 0, salary: 500 })).toEqual([
      { categoryId: "food", plannedAmount: 300000 },
      { categoryId: "salary", plannedAmount: 500 },
    ])
  })
})

describe("draftTotals — budget_totals_v 규칙 미러", () => {
  test("수입/소비/저축 합계, 소분류 금액이 있는 대분류는 제외", () => {
    const rows = buildMonthlyRows(categories, null, [])
    const totals = draftTotals(rows, {
      food: 100000, // 소분류(외식) 금액 존재 → 합계 제외
      dining: 60000,
      saving: 500000,
      salary: 4000000,
    })
    expect(totals).toEqual({ income: 4000000, consumption: 60000, saving: 500000 })
  })

  test("소분류 금액이 없으면 대분류 값 사용", () => {
    const rows = buildMonthlyRows(categories, null, [])
    const totals = draftTotals(rows, { food: 100000, dining: 0, saving: 0, salary: 0 })
    expect(totals).toEqual({ income: 0, consumption: 100000, saving: 0 })
  })
})
