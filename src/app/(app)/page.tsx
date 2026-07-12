import { HydrationBoundary } from "@tanstack/react-query"

import { HomeScreen } from "@/features/dashboard/components/home-screen"
import { prefetchDehydratedState } from "@/server/prefetch"
import { dashboardPrefetchEntries } from "@/server/prefetch-entries"

export const metadata = { title: "금전출납부 - Cashflow" }

/** 첫 진입 SSR 프리페치 — get_dashboard 현재 월 (서비스 직접 호출) */
export default async function HomePage() {
  const state = await prefetchDehydratedState(dashboardPrefetchEntries())
  return (
    <HydrationBoundary state={state ?? undefined}>
      <HomeScreen />
    </HydrationBoundary>
  )
}
