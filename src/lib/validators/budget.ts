import { z } from "zod"

import { krwAmount } from "./common"

/** 예산 연도 범위 — budgets.year CHECK (2000~2100)와 1:1 (DB.md §1.5) */
const budgetYear = z.number().int().min(2000).max(2100)
const budgetMonth = z.number().int().min(1).max(12)
const budgetYearQuery = z.coerce.number().int().min(2000).max(2100)
const budgetMonthQuery = z.coerce.number().int().min(1).max(12)

/** 예산 항목 — planned_amount ≥ 0 (0원 항목 허용, DB CHECK와 1:1) */
const budgetItemInput = z.object({
  categoryId: z.uuid(),
  plannedAmount: krwAmount.min(0, "계획 금액은 0 이상이어야 합니다"),
  memo: z.string().max(500).nullish(),
})

/** items 내 categoryId 중복 금지 (uq_budget_items_budget_category와 1:1) */
function refineUniqueItemCategories(
  value: { items?: { categoryId: string }[] },
  ctx: z.RefinementCtx,
): void {
  if (!value.items) return
  const seen = new Set<string>()
  for (const item of value.items) {
    if (seen.has(item.categoryId)) {
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: "같은 카테고리를 중복으로 담을 수 없습니다",
      })
      return
    }
    seen.add(item.categoryId)
  }
}

/** POST /budgets 본문 (API.md §6.2) — month 생략/null = 연간 예산 */
export const createBudgetSchema = z
  .object({
    name: z.string().min(1, "이름을 입력하세요").max(100),
    year: budgetYear,
    month: budgetMonth.nullish(),
    memo: z.string().max(500).nullish(),
    items: z.array(budgetItemInput).max(200).optional(),
  })
  .superRefine(refineUniqueItemCategories)

/** PATCH /budgets/{id} 본문 (API.md §6.4) — items 전달 시 전량 교체 */
export const updateBudgetSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    memo: z.string().max(500).nullish(),
    items: z.array(budgetItemInput).max(200).optional(),
  })
  .superRefine(refineUniqueItemCategories)

/** POST /budgets/copy 본문 (API.md §6.6) */
export const copyBudgetSchema = z
  .object({
    sourceYear: budgetYear,
    sourceMonth: budgetMonth,
    targetYear: budgetYear,
    targetMonth: budgetMonth,
  })
  .superRefine((value, ctx) => {
    if (
      value.sourceYear === value.targetYear &&
      value.sourceMonth === value.targetMonth
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["targetMonth"],
        message: "원본과 대상이 같은 달일 수 없습니다",
      })
    }
  })

/** GET /budgets 쿼리 (API.md §6.1) — year 필수 */
export const budgetsListQuerySchema = z.object({ year: budgetYearQuery })

/** GET /budgets/actuals 쿼리 (API.md §6.7) */
export const budgetActualsQuerySchema = z.object({
  year: budgetYearQuery,
  month: budgetMonthQuery,
})

/** GET /budgets/annual-grid 쿼리 (API.md §6.8) */
export const annualGridQuerySchema = z.object({
  year: budgetYearQuery,
  type: z.enum(["income", "expense"]).optional(),
  expenseKind: z.enum(["consumption", "saving"]).optional(),
})

/** PUT /budgets/annual-grid/cell 본문 (API.md §6.9) — amount 0 = 항목 삭제 */
export const updateAnnualGridCellSchema = z.object({
  year: budgetYear,
  month: budgetMonth,
  categoryId: z.uuid(),
  amount: krwAmount.min(0, "금액은 0 이상이어야 합니다"),
})

/** GET /budgets/summary 쿼리 (API.md §6.10) */
export const budgetSummaryQuerySchema = z.object({ year: budgetYearQuery })

export type BudgetItemInput = z.infer<typeof budgetItemInput>
export type CreateBudgetInput = z.infer<typeof createBudgetSchema>
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>
export type CopyBudgetInput = z.infer<typeof copyBudgetSchema>
export type BudgetsListQuery = z.infer<typeof budgetsListQuerySchema>
export type BudgetActualsQuery = z.infer<typeof budgetActualsQuerySchema>
export type AnnualGridQuery = z.infer<typeof annualGridQuerySchema>
export type UpdateAnnualGridCellInput = z.infer<typeof updateAnnualGridCellSchema>
export type BudgetSummaryQuery = z.infer<typeof budgetSummaryQuerySchema>
