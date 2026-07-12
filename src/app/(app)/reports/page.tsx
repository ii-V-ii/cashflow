import { Suspense } from "react"

import { HydrationBoundary } from "@tanstack/react-query"

import { ReportsScreen } from "@/features/reports/components/reports-screen"
import { prefetchDehydratedState } from "@/server/prefetch"
import {
  reportsPrefetchEntries,
  type RawSearchParams,
} from "@/server/prefetch-entries"

export const metadata = { title: "보고서 - 금전출납부" }

/** 첫 진입 SSR 프리페치 — 추이·카테고리 도넛·순자산 3종 (서비스 직접 호출) */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const state = await prefetchDehydratedState(
    reportsPrefetchEntries(await searchParams),
  )
  return (
    <HydrationBoundary state={state ?? undefined}>
      <Suspense>
        <ReportsScreen />
      </Suspense>
    </HydrationBoundary>
  )
}
