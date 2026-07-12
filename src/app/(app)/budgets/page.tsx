import { Suspense } from "react"

import { HydrationBoundary } from "@tanstack/react-query"

import { BudgetsScreen } from "@/features/budgets/components/budgets-screen"
import { prefetchDehydratedState } from "@/server/prefetch"
import {
  budgetsPrefetchEntries,
  type RawSearchParams,
} from "@/server/prefetch-entries"

export const metadata = { title: "예산 - 금전출납부" }

/** 예산 — 하단 탭 바 예산 슬롯 (PRD §3.5). 첫 진입 SSR 프리페치: 탭별 1차 쿼리 */
export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const state = await prefetchDehydratedState(
    budgetsPrefetchEntries(await searchParams),
  )
  return (
    <HydrationBoundary state={state ?? undefined}>
      <Suspense>
        <BudgetsScreen />
      </Suspense>
    </HydrationBoundary>
  )
}
