"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type {
  Budget,
  BudgetWithItems,
  AnnualBudgetSummary,
  AnnualGridData,
} from "@/types"
import type {
  CreateBudgetInput,
  UpdateBudgetInput,
  CopyBudgetInput,
} from "@/lib/validators/budget"
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api-client"

const BUDGETS_KEY = ["budgets"] as const

export function useBudgets(year?: number) {
  const params = year ? `?year=${year}` : ""
  return useQuery({
    queryKey: [...BUDGETS_KEY, year],
    queryFn: () => apiGet<Budget[]>(`/api/budget${params}`),
  })
}

export function useBudgetDetail(id: string | null) {
  return useQuery({
    queryKey: [...BUDGETS_KEY, "detail", id],
    queryFn: () => apiGet<BudgetWithItems>(`/api/budget/${id}`),
    enabled: !!id,
  })
}

export function useAnnualBudgetSummary(year: number) {
  return useQuery({
    queryKey: [...BUDGETS_KEY, "annual", year],
    queryFn: () =>
      apiGet<AnnualBudgetSummary>(`/api/budget/summary?year=${year}`),
  })
}

export function useCreateBudget() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateBudgetInput) =>
      apiPost<Budget>("/api/budget", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BUDGETS_KEY })
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    },
  })
}

export function useUpdateBudget() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateBudgetInput }) =>
      apiPut<Budget>(`/api/budget/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BUDGETS_KEY })
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    },
  })
}

export function useDeleteBudget() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiDelete<{ deleted: boolean }>(`/api/budget/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BUDGETS_KEY })
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    },
  })
}

export function useCopyBudget() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CopyBudgetInput) =>
      apiPost<Budget>("/api/budget/copy", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BUDGETS_KEY })
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    },
  })
}

// === Annual Grid ===

export function useAnnualGrid(year: number, type: "income" | "expense") {
  return useQuery({
    queryKey: [...BUDGETS_KEY, "annual-grid", year, type],
    queryFn: () =>
      apiGet<AnnualGridData>(
        `/api/budget/annual-grid?year=${year}&type=${type}`,
      ),
  })
}

interface UpdateGridCellVars {
  year: number
  month: number
  categoryId: string
  amount: number
  type: "income" | "expense"
}

export function useUpdateGridCell() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: UpdateGridCellVars) =>
      apiPut<void>("/api/budget/annual-grid", {
        year: vars.year,
        month: vars.month,
        categoryId: vars.categoryId,
        amount: vars.amount,
      }),
    onMutate: async (variables) => {
      const { year, type, categoryId, month, amount } = variables
      const queryKey = [...BUDGETS_KEY, "annual-grid", year, type]

      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<AnnualGridData>(queryKey)

      if (previous) {
        const diff = (oldAmount: number) => amount - oldAmount

        queryClient.setQueryData<AnnualGridData>(queryKey, {
          ...previous,
          groups: previous.groups.map((group) => {
            const catIndex = group.categories.findIndex(
              (c) => c.id === categoryId,
            )
            if (catIndex === -1) return group

            const cat = group.categories[catIndex]
            const oldAmount = cat.months[month] ?? 0
            const d = diff(oldAmount)

            const newCatMonths = { ...cat.months, [month]: amount }
            const newCat = {
              ...cat,
              months: newCatMonths,
              total: cat.total + d,
            }
            const newCategories = group.categories.map((c, i) =>
              i === catIndex ? newCat : c,
            )
            const newGroupMonthlyTotals = {
              ...group.monthlyTotals,
              [month]: (group.monthlyTotals[month] ?? 0) + d,
            }

            return {
              ...group,
              categories: newCategories,
              monthlyTotals: newGroupMonthlyTotals,
              total: group.total + d,
            }
          }),
          monthlyTotals: {
            ...previous.monthlyTotals,
            [month]:
              (previous.monthlyTotals[month] ?? 0) +
              amount -
              (findCategoryAmount(previous, categoryId, month) ?? 0),
          },
          grandTotal:
            previous.grandTotal +
            amount -
            (findCategoryAmount(previous, categoryId, month) ?? 0),
        })
      }

      return { previous, queryKey }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.queryKey, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: BUDGETS_KEY })
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    },
  })
}

function findCategoryAmount(
  data: AnnualGridData,
  categoryId: string,
  month: number,
): number {
  for (const group of data.groups) {
    const cat = group.categories.find((c) => c.id === categoryId)
    if (cat) return cat.months[month] ?? 0
  }
  return 0
}
