"use client"

import { useQuery } from "@tanstack/react-query"

import {
  getAnnualGrid,
  getBudget,
  getBudgetActuals,
  getBudgets,
  getBudgetSummary,
} from "@/features/budgets/api"
import { qk } from "@/lib/query-keys"

const BUDGET_STALE_TIME_MS = 30_000

export function useBudgets(year: number) {
  return useQuery({
    queryKey: qk.budgets.list(year),
    queryFn: () => getBudgets(year),
    staleTime: BUDGET_STALE_TIME_MS,
  })
}

export function useBudgetDetail(id: string | undefined) {
  return useQuery({
    queryKey: qk.budgets.detail(id ?? "none"),
    queryFn: () => getBudget(id as string),
    staleTime: BUDGET_STALE_TIME_MS,
    enabled: id !== undefined,
  })
}

/** ym: 'YYYY-MM' — 거래 뮤테이션의 budgets.actuals(ym) 무효화와 같은 입자 */
export function useBudgetActuals(ym: string) {
  const [year, month] = ym.split("-").map(Number)
  return useQuery({
    queryKey: qk.budgets.actuals(ym),
    queryFn: () => getBudgetActuals(year, month),
    staleTime: BUDGET_STALE_TIME_MS,
  })
}

/** 그리드는 전체(무필터)로 1회 조회 — 유형 필터는 클라이언트(buildGridModel)에서 */
export function useAnnualGrid(year: number) {
  return useQuery({
    queryKey: qk.budgets.annualGrid(year),
    queryFn: () => getAnnualGrid(year),
    staleTime: BUDGET_STALE_TIME_MS,
  })
}

export function useBudgetSummary(year: number) {
  return useQuery({
    queryKey: qk.budgets.summary(year),
    queryFn: () => getBudgetSummary(year),
    staleTime: BUDGET_STALE_TIME_MS,
  })
}
