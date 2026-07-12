import "server-only"

import {
  dehydrate,
  QueryClient,
  type DehydratedState,
} from "@tanstack/react-query"

import { getAuthUser } from "@/server/auth"

/** RSC 프리페치 대상 1건 — 키는 반드시 src/lib/query-keys.ts 팩토리로 생성한다 */
export interface PrefetchEntry {
  queryKey: readonly unknown[]
  queryFn: () => Promise<unknown>
}

interface PrefetchOptions {
  /** 전체 프리페치 대기 상한 — 초과분은 제외하고 렌더 진행 (기본 3초) */
  timeoutMs?: number
}

const DEFAULT_PREFETCH_TIMEOUT_MS = 3_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    // Node 환경에서 프리페치 완료 후 타이머가 프로세스를 붙잡지 않도록
    if (typeof timer === "object" && "unref" in timer) timer.unref()
  })
}

/**
 * 전 메뉴 첫 진입 SSR 프리페치 공용 유틸 (ARCHITECTURE.md §3 —
 * RSC 초기 데이터는 서비스 계층 직접 호출, HTTP 홉 없음).
 *
 * - 소유자 이메일 일치 조건은 guarded()(SEC-H1)와 동일. 단 OWNER_EMAIL
 *   미설정·검증 실패 시 guarded()는 500/403으로 거부하지만 여기서는 null만
 *   반환해 프리페치를 건너뛴다 — 페이지는 기존 클라이언트 페치로 자연
 *   폴백하고(proxy가 리다이렉트 담당) 데이터는 dehydrate되지 않는다.
 * - 개별 쿼리 실패는 서버 로그만 남기고 제외한다 — 페이지를 깨지 않는다.
 * - 성공한 쿼리만 dehydrate한다 (pending/error 직렬화 배제 — 결정적 하이드레이션).
 */
export async function prefetchDehydratedState(
  entries: readonly PrefetchEntry[],
  options?: PrefetchOptions,
): Promise<DehydratedState | null> {
  if (entries.length === 0) return null

  const user = await getAuthUser()
  const ownerEmail = process.env.OWNER_EMAIL
  if (!user || !ownerEmail || user.email !== ownerEmail) return null

  const queryClient = new QueryClient()
  const settled = Promise.allSettled(
    entries.map((entry) =>
      queryClient.fetchQuery({
        queryKey: [...entry.queryKey],
        queryFn: entry.queryFn,
        retry: false,
      }),
    ),
  ).then((results) => {
    for (const [index, result] of results.entries()) {
      if (result.status === "rejected") {
        console.error(
          "[prefetch] 쿼리 프리페치 실패 — 클라이언트 페치로 폴백:",
          entries[index].queryKey,
          result.reason,
        )
      }
    }
  })

  await Promise.race([
    settled,
    sleep(options?.timeoutMs ?? DEFAULT_PREFETCH_TIMEOUT_MS),
  ])

  return dehydrate(queryClient, {
    shouldDehydrateQuery: (query) => query.state.status === "success",
  })
}
