import "server-only"

import type {
  AnnualGridQuery,
  BudgetActualsQuery,
  BudgetsListQuery,
  BudgetSummaryQuery,
  CopyBudgetInput,
  CreateBudgetInput,
  UpdateBudgetInput,
  UpdateAnnualGridCellInput,
} from "@/lib/validators"
import { ApiError } from "@/server/api-errors"
import { getDb } from "@/server/db/client"
import { callRpc } from "@/server/rpc"
import type {
  AnnualGridCellResultDto,
  AnnualGridDto,
  AnnualGridRowDto,
  BudgetActualsDto,
  BudgetDetailDto,
  BudgetDto,
  BudgetSummaryItemDto,
  BudgetYearSummaryDto,
} from "@/types/api"

/** RPC(create/update_budget)의 items jsonb 페이로드 (snake_case — DB 규약) */
function toItemsPayload(items: CreateBudgetInput["items"]) {
  return (items ?? []).map((item) => ({
    category_id: item.categoryId,
    planned_amount: item.plannedAmount,
    memo: item.memo ?? null,
  }))
}

/** get_budget_actuals RPC 원형 (DB.md §3.11) */
interface BudgetActualsRpc {
  budgetId: string | null
  year: number
  month: number
  items: {
    categoryId: string | null
    categoryName: string
    type: "income" | "expense"
    expenseKind: "consumption" | "saving" | null
    plannedAmount: number
    actualAmount: number
    difference: number
    achievementRate: number | null
  }[]
  totals: {
    plannedIncome: number
    plannedExpense: number
    actualIncome: number
    actualExpense: number
  }
}

/** get_annual_grid RPC 원형 (DB.md §3.12) */
interface AnnualGridRpc {
  groups: (AnnualGridRowDto & { months: number[] })[]
  monthlyTotals: number[] | null
  grandTotal: number
}

/** GET /budgets — budgets ⋈ budget_totals_v 1왕복 (API.md §6.1)
 *  plannedTotal = 지출 계획 합(total_expense) — 대시보드 예산 소진율과 동일 기준. */
export async function listBudgets(
  query: BudgetsListQuery,
): Promise<BudgetSummaryItemDto[]> {
  const sql = getDb()
  const rows = await sql`
    SELECT
      b.id,
      b.name,
      b.year,
      b.month,
      (SELECT count(*)::int FROM budget_items bi WHERE bi.budget_id = b.id) AS item_count,
      v.total_expense AS planned_total
    FROM budgets b
    JOIN budget_totals_v v ON v.budget_id = b.id
    WHERE b.year = ${query.year}
    ORDER BY b.month ASC NULLS FIRST
  `
  return rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    year: row.year as number,
    month: row.month as number | null,
    itemCount: Number(row.item_count),
    plannedTotal: Number(row.planned_total),
  }))
}

/** POST /budgets — RPC create_budget 1왕복 (API.md §6.2) */
export async function createBudget(input: CreateBudgetInput): Promise<BudgetDto> {
  return callRpc<BudgetDto>("create_budget", {
    p: {
      name: input.name,
      year: input.year,
      month: input.month ?? null,
      memo: input.memo ?? null,
      items: toItemsPayload(input.items),
    },
  })
}

/** GET /budgets/{id} — 계획 + 실적 1왕복 (API.md §6.3)
 *  월별 예산은 get_budget_actuals와 조인해 항목별 actualAmount를 채운다.
 *  연간 예산(month null)은 월 실적 집계 대상이 아니므로 actual 0. */
export async function getBudget(id: string): Promise<BudgetDetailDto> {
  const sql = getDb()
  const rows = await sql`
    SELECT
      public.budget_json(b.id) AS budget,
      v.total_expense AS planned_expense,
      CASE WHEN b.month IS NOT NULL
           THEN public.get_budget_actuals(b.year, b.month)
           ELSE NULL END AS actuals
    FROM budgets b
    JOIN budget_totals_v v ON v.budget_id = b.id
    WHERE b.id = ${id}
  `
  if (rows.length === 0) {
    throw new ApiError(404, "NOT_FOUND", "예산을 찾을 수 없습니다")
  }

  const budget = rows[0].budget as BudgetDto
  const actuals = rows[0].actuals as BudgetActualsRpc | null
  const actualByCategory = new Map(
    (actuals?.items ?? []).map((item) => [item.categoryId, item.actualAmount]),
  )

  return {
    id: budget.id,
    name: budget.name,
    year: budget.year,
    month: budget.month,
    memo: budget.memo,
    items: budget.items.map((item) => ({
      ...item,
      actualAmount: actualByCategory.get(item.categoryId) ?? 0,
    })),
    plannedTotal: Number(rows[0].planned_expense),
    actualTotal: actuals?.totals.actualExpense ?? 0,
  }
}

/** PATCH /budgets/{id} — RPC update_budget 1왕복 (API.md §6.4) */
export async function updateBudget(
  id: string,
  input: UpdateBudgetInput,
): Promise<BudgetDto> {
  const payload: Record<string, unknown> = {}
  if (input.name !== undefined) payload.name = input.name
  if (input.memo !== undefined) payload.memo = input.memo
  if (input.items !== undefined) payload.items = toItemsPayload(input.items)
  return callRpc<BudgetDto>("update_budget", { p_id: id, p: payload })
}

/** DELETE /budgets/{id} — items는 FK CASCADE (API.md §6.5) */
export async function deleteBudget(id: string): Promise<{ id: string }> {
  const sql = getDb()
  const rows = await sql`DELETE FROM budgets WHERE id = ${id} RETURNING id`
  if (rows.length === 0) {
    throw new ApiError(404, "NOT_FOUND", "예산을 찾을 수 없습니다")
  }
  return { id: rows[0].id as string }
}

/** POST /budgets/copy — RPC copy_budget 1왕복 (API.md §6.6) */
export async function copyBudget(input: CopyBudgetInput): Promise<BudgetDto> {
  return callRpc<BudgetDto>("copy_budget", {
    p_source_year: input.sourceYear,
    p_source_month: input.sourceMonth,
    p_target_year: input.targetYear,
    p_target_month: input.targetMonth,
  })
}

/** GET /budgets/actuals — RPC get_budget_actuals 1왕복 (API.md §6.7)
 *  plannedTotal/actualTotal은 지출 기준(저축 포함, 수입 제외) — 예산 소진율의 분모/분자. */
export async function getBudgetActuals(
  query: BudgetActualsQuery,
): Promise<BudgetActualsDto> {
  const result = await callRpc<BudgetActualsRpc>("get_budget_actuals", {
    p_year: query.year,
    p_month: query.month,
  })
  return {
    budgetId: result.budgetId,
    year: result.year,
    month: result.month,
    categories: result.items.map((item) => ({
      categoryId: item.categoryId,
      categoryName: item.categoryName,
      type: item.type,
      expenseKind: item.expenseKind,
      planned: item.plannedAmount,
      actual: item.actualAmount,
      ratio: item.achievementRate,
    })),
    plannedTotal: result.totals.plannedExpense,
    actualTotal: result.totals.actualExpense,
  }
}

/** GET /budgets/annual-grid — RPC get_annual_grid 1왕복 (API.md §6.8) */
export async function getAnnualGrid(query: AnnualGridQuery): Promise<AnnualGridDto> {
  const result = await callRpc<AnnualGridRpc>("get_annual_grid", {
    p_year: query.year,
    p_type: query.type ?? null,
    p_expense_kind: query.expenseKind ?? null,
  })
  return {
    rows: result.groups,
    monthTotals: result.monthlyTotals ?? Array.from({ length: 12 }, () => 0),
    grandTotal: result.grandTotal,
  }
}

/** PUT /budgets/annual-grid/cell — RPC upsert_budget_cell 1왕복 (API.md §6.9) */
export async function upsertAnnualGridCell(
  input: UpdateAnnualGridCellInput,
): Promise<AnnualGridCellResultDto> {
  return callRpc<AnnualGridCellResultDto>("upsert_budget_cell", {
    p_year: input.year,
    p_month: input.month,
    p_category_id: input.categoryId,
    p_amount: input.amount,
  })
}

/** GET /budgets/summary — RPC get_budget_summary 1왕복 (API.md §6.10) */
export async function getBudgetSummary(
  query: BudgetSummaryQuery,
): Promise<BudgetYearSummaryDto> {
  return callRpc<BudgetYearSummaryDto>("get_budget_summary", {
    p_year: query.year,
  })
}
