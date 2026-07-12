import { HydrationBoundary } from "@tanstack/react-query"

import { AssetsScreen } from "@/features/assets/components/assets-screen"
import { prefetchDehydratedState } from "@/server/prefetch"
import { assetsPrefetchEntries } from "@/server/prefetch-entries"

export const metadata = { title: "자산 - 금전출납부" }

/** 첫 진입 SSR 프리페치 — 자산 목록·포트폴리오·자산 카테고리 (서비스 직접 호출) */
export default async function AssetsPage() {
  const state = await prefetchDehydratedState(assetsPrefetchEntries())
  return (
    <HydrationBoundary state={state ?? undefined}>
      <AssetsScreen />
    </HydrationBoundary>
  )
}
