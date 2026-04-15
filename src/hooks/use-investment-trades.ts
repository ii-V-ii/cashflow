"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { InvestmentTrade, AssetInvestmentSummary, AnnualTradeReport, TickerSummary } from "@/types"
import type { CreateInvestmentTradeInput, UpdateInvestmentTradeInput } from "@/lib/validators/investment-trade"
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api-client"

const TRADES_KEY = ["investment-trades"] as const

export function useInvestmentTrades(assetId?: string, from?: string, to?: string) {
  const params = new URLSearchParams()
  if (assetId) params.set("assetId", assetId)
  if (from) params.set("from", from)
  if (to) params.set("to", to)
  const qs = params.toString()

  return useQuery({
    queryKey: [...TRADES_KEY, assetId ?? "all", from ?? "", to ?? ""],
    queryFn: () =>
      apiGet<InvestmentTrade[]>(`/api/investment-trades${qs ? `?${qs}` : ""}`),
  })
}

export function useInvestmentTradeSummary(assetId: string, from?: string, to?: string) {
  const params = new URLSearchParams({ assetId })
  if (from) params.set("from", from)
  if (to) params.set("to", to)

  return useQuery({
    queryKey: [...TRADES_KEY, "summary", assetId, from ?? "", to ?? ""],
    queryFn: () =>
      apiGet<AssetInvestmentSummary>(
        `/api/investment-trades/summary?${params.toString()}`,
      ),
    enabled: !!assetId,
  })
}

export function useTickerSummaries(assetId: string, from?: string, to?: string) {
  const params = new URLSearchParams({ assetId })
  if (from) params.set("from", from)
  if (to) params.set("to", to)

  return useQuery({
    queryKey: [...TRADES_KEY, "tickers", assetId, from ?? "", to ?? ""],
    queryFn: () =>
      apiGet<TickerSummary[]>(`/api/investment-trades/tickers?${params.toString()}`),
    enabled: !!assetId,
  })
}

export function useAnnualTradeReport(year: number) {
  return useQuery({
    queryKey: [...TRADES_KEY, "annual", year],
    queryFn: () =>
      apiGet<AnnualTradeReport>(`/api/investment-trades/annual?year=${year}`),
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
