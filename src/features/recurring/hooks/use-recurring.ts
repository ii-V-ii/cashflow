"use client"

import { useQuery } from "@tanstack/react-query"

import { getRecurringList } from "@/features/recurring/api"
import { qk } from "@/lib/query-keys"

const RECURRING_STALE_TIME_MS = 30_000

/** 정기 거래 규칙 목록 (API.md §12.1) */
export function useRecurringList(enabled = true) {
  return useQuery({
    queryKey: qk.recurring.list(),
    queryFn: getRecurringList,
    staleTime: RECURRING_STALE_TIME_MS,
    enabled,
  })
}
