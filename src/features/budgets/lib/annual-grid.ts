import type { AnnualGridDto, CategoryDto } from "@/types/api"

const MONTHS_IN_YEAR = 12

export interface GridRow {
  categoryId: string
  categoryName: string
  parentId: string | null
  months: number[]
  total: number
}

export interface GridGroup {
  categoryId: string
  categoryName: string
  rows: GridRow[]
  months: number[]
  total: number
}

export interface GridModel {
  groups: GridGroup[]
  monthTotals: number[]
  grandTotal: number
}

const zeroMonths = () => Array.from({ length: MONTHS_IN_YEAR }, () => 0)

/**
 * 카테고리 전체(0원 초기화) × API 그리드 값 병합 모델.
 * 그룹 월합계는 get_annual_grid와 동일 규칙 — 소분류 값이 있는 달은 소분류만 합산.
 */
export function buildGridModel(
  categories: CategoryDto[],
  grid: AnnualGridDto | undefined,
): GridModel {
  const monthsByCategory = new Map<string, number[]>()
  for (const apiRow of grid?.rows ?? []) {
    for (const cell of apiRow.categories) {
      monthsByCategory.set(cell.categoryId, cell.months)
    }
  }

  const parents = categories
    .filter((category) => category.parentId === null)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  const groups = parents.map((parent): GridGroup => {
    const children = categories
      .filter((category) => category.parentId === parent.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)

    const rows = [parent, ...children].map((category): GridRow => {
      const months = monthsByCategory.get(category.id) ?? zeroMonths()
      return {
        categoryId: category.id,
        categoryName: category.name,
        parentId: category.parentId,
        months,
        total: months.reduce((sum, amount) => sum + amount, 0),
      }
    })

    const [parentRow, ...childRows] = rows
    const months = zeroMonths().map((_, index) => {
      const childSum = childRows.reduce((sum, row) => sum + row.months[index], 0)
      return childSum > 0 ? childSum : parentRow.months[index]
    })

    return {
      categoryId: parent.id,
      categoryName: parent.name,
      rows,
      months,
      total: months.reduce((sum, amount) => sum + amount, 0),
    }
  })

  const monthTotals = zeroMonths().map((_, index) =>
    groups.reduce((sum, group) => sum + group.months[index], 0),
  )

  return {
    groups,
    monthTotals,
    grandTotal: monthTotals.reduce((sum, amount) => sum + amount, 0),
  }
}
