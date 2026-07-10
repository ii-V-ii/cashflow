import { apiFetch } from "@/lib/api/http"
import type {
  CopyBudgetInput,
  CreateBudgetInput,
  UpdateAnnualGridCellInput,
  UpdateBudgetInput,
} from "@/lib/validators/budget"
import type {
  AnnualGridCellResultDto,
  AnnualGridDto,
  BudgetActualsDto,
  BudgetDetailDto,
  BudgetDto,
  BudgetSummaryItemDto,
  BudgetYearSummaryDto,
} from "@/types/api"

/** 쿼리스트링 조립 — 거래 api.ts의 toSearchParams 관례 (리뷰 LOW) */
function toSearchParams(params: Record<string, number | string | undefined>): string {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) searchParams.set(key, String(value))
  }
  return searchParams.toString()
}

export function getBudgets(year: number): Promise<BudgetSummaryItemDto[]> {
  return apiFetch(`/api/v1/budgets?${toSearchParams({ year })}`)
}

export function createBudget(input: CreateBudgetInput): Promise<BudgetDto> {
  return apiFetch("/api/v1/budgets", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function getBudget(id: string): Promise<BudgetDetailDto> {
  return apiFetch(`/api/v1/budgets/${id}`)
}

export function updateBudget(id: string, input: UpdateBudgetInput): Promise<BudgetDto> {
  return apiFetch(`/api/v1/budgets/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  })
}

export function deleteBudget(id: string): Promise<{ id: string }> {
  return apiFetch(`/api/v1/budgets/${id}`, { method: "DELETE" })
}

export function copyBudget(input: CopyBudgetInput): Promise<BudgetDto> {
  return apiFetch("/api/v1/budgets/copy", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function getBudgetActuals(year: number, month: number): Promise<BudgetActualsDto> {
  return apiFetch(`/api/v1/budgets/actuals?${toSearchParams({ year, month })}`)
}

export function getAnnualGrid(year: number): Promise<AnnualGridDto> {
  return apiFetch(`/api/v1/budgets/annual-grid?${toSearchParams({ year })}`)
}

export function upsertAnnualGridCell(
  input: UpdateAnnualGridCellInput,
): Promise<AnnualGridCellResultDto> {
  return apiFetch("/api/v1/budgets/annual-grid/cell", {
    method: "PUT",
    body: JSON.stringify(input),
  })
}

export function getBudgetSummary(year: number): Promise<BudgetYearSummaryDto> {
  return apiFetch(`/api/v1/budgets/summary?${toSearchParams({ year })}`)
}
