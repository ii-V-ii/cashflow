import { describe, expect, test } from "vitest"

import { buildGridModel } from "@/features/budgets/lib/annual-grid"
import type { AnnualGridDto, CategoryDto } from "@/types/api"

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

const food = category({ id: "food", name: "식비" })
const dining = category({ id: "dining", name: "외식", parentId: "food" })
const transport = category({ id: "transport", name: "교통", sortOrder: 1 })
const categories = [food, dining, transport]

function months(entries: Record<number, number>): number[] {
  return Array.from({ length: 12 }, (_, index) => entries[index + 1] ?? 0)
}

const apiGrid: AnnualGridDto = {
  rows: [
    {
      categoryId: "food",
      categoryName: "식비",
      type: "expense",
      expenseKind: "consumption",
      categories: [
        {
          categoryId: "food",
          categoryName: "식비",
          parentId: null,
          months: months({ 3: 300000, 5: 100000 }),
          total: 400000,
        },
        {
          categoryId: "dining",
          categoryName: "외식",
          parentId: "food",
          months: months({ 5: 60000 }),
          total: 60000,
        },
      ],
      months: months({ 3: 300000, 5: 60000 }),
      total: 360000,
    },
  ],
  monthTotals: months({ 3: 300000, 5: 60000 }),
  grandTotal: 360000,
}

describe("buildGridModel", () => {
  test("카테고리 전체가 행으로 나오고 API 값이 채워진다 (0원 초기화 그리드)", () => {
    const model = buildGridModel(categories, apiGrid)

    expect(model.groups.map((group) => group.categoryId)).toEqual(["food", "transport"])
    const foodGroup = model.groups[0]
    expect(foodGroup.rows.map((row) => row.categoryId)).toEqual(["food", "dining"])
    expect(foodGroup.rows[0].months[2]).toBe(300000)
    expect(foodGroup.rows[1].months[4]).toBe(60000)
    // 값이 전혀 없는 교통도 0으로 채워진 행
    expect(model.groups[1].rows[0].months).toEqual(months({}))
  })

  test("그룹 월합계: 소분류 값이 있는 달은 소분류만, 없으면 대분류 자신", () => {
    const model = buildGridModel(categories, apiGrid)
    const foodGroup = model.groups[0]

    expect(foodGroup.months[2]).toBe(300000) // 3월 — 대분류 자신
    expect(foodGroup.months[4]).toBe(60000) // 5월 — 소분류만 (대분류 100000 무시)
    expect(foodGroup.total).toBe(360000)
  })

  test("전체 월합계·총계", () => {
    const model = buildGridModel(categories, apiGrid)
    expect(model.monthTotals[2]).toBe(300000)
    expect(model.monthTotals[4]).toBe(60000)
    expect(model.grandTotal).toBe(360000)
  })

  test("API 데이터가 없어도 카테고리 행은 0으로 표시", () => {
    const model = buildGridModel(categories, undefined)
    expect(model.groups).toHaveLength(2)
    expect(model.grandTotal).toBe(0)
  })
})
