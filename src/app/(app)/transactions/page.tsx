import { Suspense } from "react"

import { HydrationBoundary } from "@tanstack/react-query"

import { TransactionsScreen } from "@/features/transactions/components/transactions-screen"
import { prefetchDehydratedState } from "@/server/prefetch"
import {
  transactionsPrefetchEntries,
  type RawSearchParams,
} from "@/server/prefetch-entries"

export const metadata = { title: "거래 - 금전출납부" }

/** 첫 진입 SSR 프리페치 — 월 원장 + 폼용 계좌·카테고리 (서비스 직접 호출) */
export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const state = await prefetchDehydratedState(
    transactionsPrefetchEntries(await searchParams),
  )
  return (
    <HydrationBoundary state={state ?? undefined}>
      <Suspense>
        <TransactionsScreen />
      </Suspense>
    </HydrationBoundary>
  )
}
