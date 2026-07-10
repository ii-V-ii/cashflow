"use client"

import { useQuery } from "@tanstack/react-query"

import {
  getCategoryReport,
  getNetWorthReport,
  getTrendReport,
} from "@/features/reports/api"
import { qk } from "@/lib/query-keys"

const REPORT_STALE_TIME_MS = 60_000

/** 수입/지출 추이 (API.md §14.1) */
export function useTrendReport(from: string, to: string) {
  return useQuery({
    queryKey: qk.reports.trend(from, to),
    queryFn: () => getTrendReport(from, to),
    staleTime: REPORT_STALE_TIME_MS,
  })
}

/** 카테고리별 지출 도넛 (API.md §14.2) */
export function useCategoryReport(ym: string) {
  return useQuery({
    queryKey: qk.reports.categories(ym),
    queryFn: () => getCategoryReport(ym),
    staleTime: REPORT_STALE_TIME_MS,
  })
}

/** 순자산 추이 (API.md §14.3) */
export function useNetWorthReport(months: number) {
  return useQuery({
    queryKey: qk.reports.netWorth(months),
    queryFn: () => getNetWorthReport(months),
    staleTime: REPORT_STALE_TIME_MS,
  })
}
