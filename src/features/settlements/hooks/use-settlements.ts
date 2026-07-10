"use client"

import { useQuery } from "@tanstack/react-query"

import {
  getAnnualSettlement,
  getMonthlySettlement,
} from "@/features/settlements/api"
import { qk } from "@/lib/query-keys"

const SETTLEMENT_STALE_TIME_MS = 60_000

/** 월 결산 — get_monthly_settlement RPC 1왕복 (API.md §7.1) */
export function useMonthlySettlement(ym: string) {
  return useQuery({
    queryKey: qk.settlements.monthly(ym),
    queryFn: () => getMonthlySettlement(ym),
    staleTime: SETTLEMENT_STALE_TIME_MS,
  })
}

/** 연간 결산 — get_annual_settlement RPC 1왕복 (API.md §7.2) */
export function useAnnualSettlement(year: number) {
  return useQuery({
    queryKey: qk.settlements.annual(year),
    queryFn: () => getAnnualSettlement(year),
    staleTime: SETTLEMENT_STALE_TIME_MS,
  })
}
