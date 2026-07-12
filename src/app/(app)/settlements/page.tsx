import { Suspense } from "react"

import { HydrationBoundary } from "@tanstack/react-query"

import { SettlementsScreen } from "@/features/settlements/components/settlements-screen"
import { prefetchDehydratedState } from "@/server/prefetch"
import {
  settlementsPrefetchEntries,
  type RawSearchParams,
} from "@/server/prefetch-entries"

export const metadata = { title: "결산 - 금전출납부" }

/** 첫 진입 SSR 프리페치 — 월별/연간 결산 RPC (서비스 직접 호출) */
export default async function SettlementsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const state = await prefetchDehydratedState(
    settlementsPrefetchEntries(await searchParams),
  )
  return (
    <HydrationBoundary state={state ?? undefined}>
      <Suspense>
        <SettlementsScreen />
      </Suspense>
    </HydrationBoundary>
  )
}
