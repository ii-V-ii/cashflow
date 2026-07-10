"use client"

import { useQuery } from "@tanstack/react-query"

import { getDashboard } from "@/features/dashboard/api"
import { qk } from "@/lib/query-keys"

const DASHBOARD_STALE_TIME_MS = 30_000

/** 대시보드 전체 — get_dashboard RPC 1왕복 캐시 (API.md §8.1) */
export function useDashboard(ym: string) {
  return useQuery({
    queryKey: qk.dashboard.month(ym),
    queryFn: () => getDashboard(ym),
    staleTime: DASHBOARD_STALE_TIME_MS,
  })
}
