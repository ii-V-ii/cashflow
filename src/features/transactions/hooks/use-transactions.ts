"use client"

import { useQuery } from "@tanstack/react-query"

import { qk } from "@/lib/query-keys"
import {
  getTransactions,
  getTransactionsMonth,
  type TransactionListFilter,
} from "@/features/transactions/api"

const MONTH_STALE_TIME_MS = 30_000

/** 월 원장 (낙관적 업데이트 대상 캐시 — ARCHITECTURE.md §6.2, §7) */
export function useTransactionsMonth(ym: string, enabled = true) {
  return useQuery({
    queryKey: qk.transactions.month(ym),
    queryFn: () => getTransactionsMonth(ym),
    staleTime: MONTH_STALE_TIME_MS,
    enabled,
  })
}

/** 필터/페이지네이션 목록 — 낙관적 삽입 제외, 무효화만 (ARCHITECTURE.md §7) */
export function useTransactionsList(
  filter: TransactionListFilter,
  page: number,
  limit: number,
  enabled = true,
) {
  return useQuery({
    queryKey: qk.transactions.list(filter, page, limit),
    queryFn: () => getTransactions(filter, page, limit),
    staleTime: MONTH_STALE_TIME_MS,
    enabled, // 필터 미사용 시 요청 자체를 만들지 않는다 (월 원장만 1왕복)
  })
}
