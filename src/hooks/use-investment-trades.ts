"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { InvestmentTrade, AssetInvestmentSummary } from "@/types"
import type { CreateInvestmentTradeInput, UpdateInvestmentTradeInput } from "@/lib/validators/investment-trade"
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api-client"

const TRADES_KEY = ["investment-trades"] as const

export function useInvestmentTrades(assetId?: string) {
  const params = new URLSearchParams()
  if (assetId) params.set("assetId", assetId)
  const qs = params.toString()

  return useQuery({
    queryKey: [...TRADES_KEY, assetId ?? "all"],
    queryFn: () =>
      apiGet<InvestmentTrade[]>(`/api/investment-trades${qs ? `?${qs}` : ""}`),
  })
}

export function useInvestmentTradeSummary(assetId: string) {
  return useQuery({
    queryKey: [...TRADES_KEY, "summary", assetId],
    queryFn: () =>
      apiGet<AssetInvestmentSummary>(
        `/api/investment-trades/summary?assetId=${assetId}`,
      ),
    enabled: !!assetId,
  })
}

export function useCreateTrade() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateInvestmentTradeInput) =>
      apiPost<InvestmentTrade>("/api/investment-trades", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRADES_KEY })
    },
  })
}

export function useUpdateTrade() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateInvestmentTradeInput }) =>
      apiPut<InvestmentTrade>(`/api/investment-trades/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRADES_KEY })
    },
  })
}

export function useDeleteTrade() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      apiDelete<{ deleted: boolean }>(`/api/investment-trades/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRADES_KEY })
    },
  })
}
