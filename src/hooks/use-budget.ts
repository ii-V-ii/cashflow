"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { Budget, BudgetWithItems, AnnualBudgetSummary } from "@/types"
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
