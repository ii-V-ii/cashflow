"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { InvestmentReturn, InvestmentSummary } from "@/types"
import type { CreateInvestmentReturnInput } from "@/lib/validators/investment"
import { apiGet, apiPost, apiPut } from "@/lib/api-client"

const INVESTMENTS_KEY = ["investments"] as const

export function useInvestmentSummary(year: number) {
  return useQuery({
    queryKey: [...INVESTMENTS_KEY, "summary", year],
    queryFn: () =>
      apiGet<InvestmentSummary>(`/api/investments/summary?year=${year}`),
  })
}

export function useInvestmentReturns(year: number, month?: number) {
  const params = new URLSearchParams({ year: String(year) })
  if (month) params.set("month", String(month))

  return useQuery({
    queryKey: [...INVESTMENTS_KEY, year, month ?? "all"],
    queryFn: () =>
      apiGet<InvestmentReturn[]>(`/api/investments?${params.toString()}`),
  })
}

export function useCreateInvestmentReturn() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateInvestmentReturnInput) =>
      apiPost<InvestmentReturn>("/api/investments", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INVESTMENTS_KEY })
    },
  })
}

export function useUpdateInvestmentReturn() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string
      data: Partial<CreateInvestmentReturnInput>
    }) => apiPut<InvestmentReturn>(`/api/investments/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INVESTMENTS_KEY })
    },
  })
}
