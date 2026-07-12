import { HydrationBoundary } from "@tanstack/react-query"

import { ForecastScreen } from "@/features/forecast/components/forecast-screen"
import { prefetchDehydratedState } from "@/server/prefetch"
import { forecastPrefetchEntries } from "@/server/prefetch-entries"

export const metadata = { title: "예측 - 금전출납부" }

/** 첫 진입 SSR 프리페치 — 시나리오 목록 (서비스 직접 호출) */
export default async function ForecastPage() {
  const state = await prefetchDehydratedState(forecastPrefetchEntries())
  return (
    <HydrationBoundary state={state ?? undefined}>
      <ForecastScreen />
    </HydrationBoundary>
  )
}
