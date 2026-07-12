import { HydrationBoundary } from "@tanstack/react-query"

import { AccountsScreen } from "@/features/accounts/components/accounts-screen"
import { prefetchDehydratedState } from "@/server/prefetch"
import { accountsPrefetchEntries } from "@/server/prefetch-entries"

export const metadata = { title: "계좌 - 금전출납부" }

/** 첫 진입 SSR 프리페치 — 계좌 목록(잔액 뷰 조인) (서비스 직접 호출) */
export default async function AccountsPage() {
  const state = await prefetchDehydratedState(accountsPrefetchEntries())
  return (
    <HydrationBoundary state={state ?? undefined}>
      <AccountsScreen />
    </HydrationBoundary>
  )
}
