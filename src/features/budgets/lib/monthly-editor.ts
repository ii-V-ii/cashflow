import type {
  BudgetActualCategoryDto,
  BudgetDetailDto,
  CategoryDto,
} from "@/types/api"

/** 월별 예산 화면의 구분 그룹 — 수입/소비/저축 (PRD §3.5) */
export type BudgetGroup = "income" | "consumption" | "saving"

export interface MonthlyRow {
  categoryId: string | null
  categoryName: string
  group: BudgetGroup
  parentId: string | null
  planned: number
  actual: number
  /** 카테고리 목록에 없는 실적 전용 행(미분류 등) — 편집 불가 */
  readonly: boolean
}

/** categoryId → 계획 금액 드래프트 (인라인 편집 상태) */
export type PlannedDraft = Record<string, number>

export function budgetGroupOf(
  type: "income" | "expense",
  expenseKind: "consumption" | "saving" | null,
): BudgetGroup {
  if (type === "income") return "income"
  return expenseKind === "saving" ? "saving" : "consumption"
}

/** 대분류 아래에 소분류가 이어지도록 정렬 (수입 → 소비/저축 순서는 화면에서 그룹핑) */
function sortWithChildren(categories: CategoryDto[]): CategoryDto[] {
  const parents = categories
    .filter((category) => category.parentId === null)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const childrenOf = (parentId: string) =>
    categories
      .filter((category) => category.parentId === parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
  return parents.flatMap((parent) => [parent, ...childrenOf(parent.id)])
}

/**
 * 카테고리 전체 × (계획 항목, 실적)을 행으로 병합 — "0원 초기화 그리드"의 기반.
 * 실적은 get_budget_actuals의 부착 규칙(자기 항목 > 부모 항목 > 대분류)을 그대로 사용한다.
 */
export function buildMonthlyRows(
  categories: CategoryDto[],
  detail: BudgetDetailDto | null,
  actuals: BudgetActualCategoryDto[],
): MonthlyRow[] {
  const plannedByCategory = new Map(
    (detail?.items ?? []).map((item) => [item.categoryId, item.plannedAmount]),
  )
  const actualByCategory = new Map(
    actuals
      .filter((row) => row.categoryId !== null)
      .map((row) => [row.categoryId as string, row.actual]),
  )

  const categoryRows = sortWithChildren(categories).map((category): MonthlyRow => {
    const parent = category.parentId
      ? categories.find((item) => item.id === category.parentId)
      : undefined
    return {
      categoryId: category.id,
      categoryName: category.name,
      group: budgetGroupOf(
        category.type,
        (parent?.expenseKind ?? category.expenseKind) as "consumption" | "saving" | null,
      ),
      parentId: category.parentId,
      planned: plannedByCategory.get(category.id) ?? 0,
      actual: actualByCategory.get(category.id) ?? 0,
      readonly: false,
    }
  })

  const knownIds = new Set(categories.map((category) => category.id))
  const extraRows = actuals
    .filter((row) => row.categoryId === null || !knownIds.has(row.categoryId))
    .map(
      (row): MonthlyRow => ({
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        group: budgetGroupOf(row.type, row.expenseKind),
        parentId: null,
        planned: row.planned,
        actual: row.actual,
        readonly: true,
      }),
    )

  return [...categoryRows, ...extraRows]
}

/** 서버 계획 금액 기준의 초기 드래프트 (항목 없으면 0) */
export function baselineDraft(
  categories: CategoryDto[],
  detail: BudgetDetailDto | null,
): PlannedDraft {
  const plannedByCategory = new Map(
    (detail?.items ?? []).map((item) => [item.categoryId, item.plannedAmount]),
  )
  return Object.fromEntries(
    categories.map((category) => [category.id, plannedByCategory.get(category.id) ?? 0]),
  )
}

export function isDraftDirty(draft: PlannedDraft, baseline: PlannedDraft): boolean {
  const keys = new Set([...Object.keys(draft), ...Object.keys(baseline)])
  for (const key of keys) {
    if ((draft[key] ?? 0) !== (baseline[key] ?? 0)) return true
  }
  return false
}

/** PATCH/POST items 페이로드 — 0원 항목은 만들지 않는다 */
export function toItemsInput(
  draft: PlannedDraft,
): { categoryId: string; plannedAmount: number }[] {
  return Object.entries(draft)
    .filter(([, amount]) => amount > 0)
    .map(([categoryId, plannedAmount]) => ({ categoryId, plannedAmount }))
}

/**
 * 수입/소비/저축 실시간 합계 — budget_totals_v와 동일 규칙:
 * 소분류 금액이 있는 대분류는 합계에서 제외(중복 방지).
 */
export function draftTotals(
  rows: MonthlyRow[],
  draft: PlannedDraft,
): Record<BudgetGroup, number> {
  const totals: Record<BudgetGroup, number> = { income: 0, consumption: 0, saving: 0 }
  for (const row of rows) {
    if (row.readonly || row.categoryId === null) continue
    const amount = draft[row.categoryId] ?? 0
    if (amount <= 0) continue
    const hasChildAmount = rows.some(
      (child) =>
        child.parentId === row.categoryId &&
        child.categoryId !== null &&
        (draft[child.categoryId] ?? 0) > 0,
    )
    if (hasChildAmount) continue
    totals[row.group] += amount
  }
  return totals
}
