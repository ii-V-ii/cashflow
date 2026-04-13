"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api-client"
import type { RecurringTransaction } from "@/types"

const RECURRING_KEY = ["recurring"] as const

export function useRecurringTransactions() {
  return useQuery({
    queryKey: RECURRING_KEY,
    queryFn: () => apiGet<RecurringTransaction[]>("/api/recurring"),
  })
}

export function useCreateRecurring() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiPost<RecurringTransaction>("/api/recurring", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RECURRING_KEY })
    },
  })
}

export function useUpdateRecurring() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiPut<RecurringTransaction>(`/api/recurring/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RECURRING_KEY })
    },
  })
}

export function useDeleteRecurring() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiDelete<{ deleted: boolean }>(`/api/recurring/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RECURRING_KEY })
    },
  })
}
