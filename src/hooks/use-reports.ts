"use client"

import { useQuery } from "@tanstack/react-query"
import type {
  IncomeExpenseTrendItem,
  CategoryAnalysis,
  NetWorthPoint,
} from "@/types"
import { apiGet } from "@/lib/api-client"

const REPORTS_KEY = ["reports"] as const

export function useIncomeExpenseTrend(from: string, to: string) {
  return useQuery({
    queryKey: [...REPORTS_KEY, "trend", from, to],
    queryFn: () =>
      apiGet<IncomeExpenseTrendItem[]>(
        `/api/reports/trend?from=${from}&to=${to}`,
      ),
    enabled: !!from && !!to,
  })
}

export function useCategoryAnalysis(year: number, month: number) {
  return useQuery({
    queryKey: [...REPORTS_KEY, "categories", year, month],
    queryFn: () =>
      apiGet<CategoryAnalysis>(
        `/api/reports/categories?year=${year}&month=${month}`,
      ),
  })
}

export function useNetWorthTrend(months: number = 12) {
  return useQuery({
    queryKey: [...REPORTS_KEY, "net-worth", months],
    queryFn: () =>
      apiGet<NetWorthPoint[]>(`/api/reports/net-worth?months=${months}`),
  })
}
