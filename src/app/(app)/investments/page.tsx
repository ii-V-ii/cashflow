import { HydrationBoundary } from "@tanstack/react-query"

import { InvestmentsScreen } from "@/features/investments/components/investments-screen"
import { prefetchDehydratedState } from "@/server/prefetch"
import { investmentsPrefetchEntries } from "@/server/prefetch-entries"

export const metadata = { title: "투자 - 금전출납부" }

/** 첫 진입 SSR 프리페치 — 자산 목록 + 매매 1페이지 (서비스 직접 호출) */
export default async function InvestmentsPage() {
  const state = await prefetchDehydratedState(investmentsPrefetchEntries())
  return (
    <HydrationBoundary state={state ?? undefined}>
      <InvestmentsScreen />
    </HydrationBoundary>
  )
}
