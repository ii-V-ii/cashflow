"use client"

import { useQuery } from "@tanstack/react-query"
import type { MonthlySettlement, AnnualSettlement } from "@/types"
import { apiGet } from "@/lib/api-client"

const SETTLEMENT_KEY = ["settlement"] as const

export function useMonthlySettlement(year: number, month: number) {
  return useQuery({
    queryKey: [...SETTLEMENT_KEY, "monthly", year, month],
    queryFn: () =>
      apiGet<MonthlySettlement>(
        `/api/reports/settlement?year=${year}&month=${month}`,
      ),
  })
}

export function useAnnualSettlement(year: number) {
  return useQuery({
    queryKey: [...SETTLEMENT_KEY, "annual", year],
    queryFn: () =>
      apiGet<AnnualSettlement>(`/api/reports/settlement?year=${year}`),
  })
}
