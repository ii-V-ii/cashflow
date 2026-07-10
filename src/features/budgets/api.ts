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

export function getBudgets(year: number): Promise<BudgetSummaryItemDto[]> {
  return apiFetch(`/api/v1/budgets?year=${year}`)
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
  return apiFetch(`/api/v1/budgets/actuals?year=${year}&month=${month}`)
}

export function getAnnualGrid(year: number): Promise<AnnualGridDto> {
  return apiFetch(`/api/v1/budgets/annual-grid?year=${year}`)
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
  return apiFetch(`/api/v1/budgets/summary?year=${year}`)
}
