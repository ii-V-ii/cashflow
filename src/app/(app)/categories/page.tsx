import { HydrationBoundary } from "@tanstack/react-query"

import { CategoriesScreen } from "@/features/categories/components/categories-screen"
import { prefetchDehydratedState } from "@/server/prefetch"
import { categoriesPrefetchEntries } from "@/server/prefetch-entries"

export const metadata = { title: "카테고리 - 금전출납부" }

/** 첫 진입 SSR 프리페치 — 지출 카테고리 목록(기본 탭) (서비스 직접 호출) */
export default async function CategoriesPage() {
  const state = await prefetchDehydratedState(categoriesPrefetchEntries())
  return (
    <HydrationBoundary state={state ?? undefined}>
      <CategoriesScreen />
    </HydrationBoundary>
  )
}
