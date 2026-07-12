import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const getAuthUserMock = vi.fn<() => Promise<{ id: string; email: string | null } | null>>()

vi.mock("@/server/auth", () => ({
  getAuthUser: () => getAuthUserMock(),
}))

import { hashKey } from "@tanstack/react-query"

import { prefetchDehydratedState, type PrefetchEntry } from "@/server/prefetch"

const OWNER = { id: "owner-id", email: "owner@local.test" }

function entry(key: readonly unknown[], data: unknown): PrefetchEntry {
  return { queryKey: key, queryFn: () => Promise.resolve(data) }
}

/** dehydrate 결과에서 큐리 키 해시로 데이터 조회 */
function findDehydratedData(
  state: { queries: { queryHash: string; state: { data?: unknown } }[] },
  key: readonly unknown[],
): unknown {
  return state.queries.find((query) => query.queryHash === hashKey(key as unknown[]))
    ?.state.data
}

beforeEach(() => {
  vi.stubEnv("OWNER_EMAIL", OWNER.email)
  getAuthUserMock.mockResolvedValue(OWNER)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("prefetchDehydratedState — 인증/소유자 가드", () => {
  test("미인증 세션이면 null (클라이언트 페치 폴백)", async () => {
    getAuthUserMock.mockResolvedValue(null)

    const state = await prefetchDehydratedState([entry(["a"], 1)])

    expect(state).toBeNull()
  })

  test("OWNER_EMAIL 미설정이면 null (fail-closed)", async () => {
    vi.stubEnv("OWNER_EMAIL", "")

    const state = await prefetchDehydratedState([entry(["a"], 1)])

    expect(state).toBeNull()
  })

  test("소유자 이메일 불일치면 null", async () => {
    getAuthUserMock.mockResolvedValue({ id: "x", email: "intruder@evil.test" })

    const state = await prefetchDehydratedState([entry(["a"], 1)])

    expect(state).toBeNull()
  })

  test("빈 엔트리 배열이면 null", async () => {
    const state = await prefetchDehydratedState([])

    expect(state).toBeNull()
  })
})

describe("prefetchDehydratedState — 성공/실패 동작", () => {
  test("성공한 쿼리는 dehydrate 상태에 키·데이터가 실린다", async () => {
    const key = ["transactions", "month", "2026-07"] as const
    const data = { items: [{ id: "t1" }], total: 1 }

    const state = await prefetchDehydratedState([entry(key, data)])

    expect(state).not.toBeNull()
    expect(findDehydratedData(state!, key)).toEqual(data)
  })

  test("일부 실패 시 페이지를 깨지 않는다 — 성공 쿼리만 dehydrate + 서버 로그", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const okKey = ["accounts", "list"] as const
    const failKey = ["dashboard", "month", "2026-07"] as const
    const failing: PrefetchEntry = {
      queryKey: failKey,
      queryFn: () => Promise.reject(new Error("rpc down")),
    }

    const state = await prefetchDehydratedState([entry(okKey, [1, 2]), failing])

    expect(state).not.toBeNull()
    expect(findDehydratedData(state!, okKey)).toEqual([1, 2])
    expect(findDehydratedData(state!, failKey)).toBeUndefined()
    expect(errorSpy).toHaveBeenCalled()
  })

  test("타임아웃 초과 쿼리는 제외하고 완료된 것만 반환한다 (렌더 블로킹 방지)", async () => {
    const fastKey = ["categories", "list", "expense"] as const
    const slow: PrefetchEntry = {
      queryKey: ["reports", "trend", "a", "b"],
      queryFn: () => new Promise(() => {}), // never resolves
    }

    const state = await prefetchDehydratedState(
      [entry(fastKey, ["c1"]), slow],
      { timeoutMs: 100 },
    )

    expect(state).not.toBeNull()
    expect(findDehydratedData(state!, fastKey)).toEqual(["c1"])
    expect(findDehydratedData(state!, slow.queryKey)).toBeUndefined()
  })
})
