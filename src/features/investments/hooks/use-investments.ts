"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  createTrade,
  deleteTrade,
  getAnnualSummary,
  getTickerBreakdown,
  getTradeSummary,
  getTrades,
  updateTradeMemo,
} from "@/features/investments/api"
import { qk } from "@/lib/query-keys"
import type { CreateInvestmentTradeInput } from "@/lib/validators"
import { useToastStore } from "@/stores/toast-store"
import type { TradeFilter, TradeRangeFilter } from "@/types"

const TRADES_STALE_TIME_MS = 30_000

export function useTrades(filter: TradeFilter, page: number) {
  return useQuery({
    queryKey: qk.trades.list(filter, page),
    queryFn: () => getTrades(filter, page),
    staleTime: TRADES_STALE_TIME_MS,
  })
}

export function useTradeSummary(filter: TradeRangeFilter) {
  return useQuery({
    queryKey: qk.trades.summary(filter),
    queryFn: () => getTradeSummary(filter),
    staleTime: TRADES_STALE_TIME_MS,
  })
}

export function useTickerBreakdown(filter: TradeRangeFilter) {
  return useQuery({
    queryKey: qk.trades.tickers(filter),
    queryFn: () => getTickerBreakdown(filter),
    staleTime: TRADES_STALE_TIME_MS,
  })
}

export function useAnnualSummary(year: number) {
  return useQuery({
    queryKey: qk.trades.annual(year),
    queryFn: () => getAnnualSummary(year),
    staleTime: TRADES_STALE_TIME_MS,
  })
}

/**
 * 매매 CUD — FIFO 파생값(로트 잔량·실현손익·잔액·자산가치)이 서버에서만 계산되므로
 * 낙관적 업데이트 없이 관련 캐시 전체 무효화 (ARCHITECTURE.md §6.3).
 */
export function useTradeMutations() {
  const queryClient = useQueryClient()
  const showToast = useToastStore((state) => state.show)

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: qk.trades.all })
    void queryClient.invalidateQueries({ queryKey: qk.assets.all })
    void queryClient.invalidateQueries({ queryKey: qk.accounts.all })
    void queryClient.invalidateQueries({ queryKey: qk.dashboard.all })
  }
  const onError = (error: Error) => showToast(error.message, "error")

  const create = useMutation({
    mutationFn: (input: CreateInvestmentTradeInput) => createTrade(input),
    onSuccess: invalidate,
    onError,
  })
  const updateMemo = useMutation({
    mutationFn: ({ id, memo }: { id: string; memo: string | null }) =>
      updateTradeMemo(id, memo),
    onSuccess: invalidate,
    onError,
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteTrade(id),
    onSuccess: invalidate,
    onError,
  })

  return { create, updateMemo, remove }
}
