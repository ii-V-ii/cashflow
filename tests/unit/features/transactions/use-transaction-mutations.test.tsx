// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/features/transactions/api", () => ({
  createTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
}))

import * as api from "@/features/transactions/api"
import {
  useCreateTransaction,
  useDeleteTransaction,
  useUpdateTransaction,
} from "@/features/transactions/hooks/use-transaction-mutations"
import type { MonthCache } from "@/lib/optimistic/transactions"
import { qk } from "@/lib/query-keys"
import type { TransactionDto } from "@/types/api"

/**
 * 101건+ 월 원장 버그 회귀: 낙관적 업데이트가 단일 transactions.month(ym) 캐시가 아니라
 * 캐시된 모든 monthPage(ym, page)에 걸쳐 적용되어야 한다 (설계도 3단계).
 */

type MonthPage = MonthCache<TransactionDto>

function tx(overrides: Partial<TransactionDto>): TransactionDto {
  return {
    id: "t-default",
    type: "expense",
    amount: 1000,
    description: "기본",
    date: "2026-07-15",
    categoryId: null,
    category: null,
    accountId: "acc-a",
    account: { id: "acc-a", name: "은행", type: "bank" },
    toAccountId: null,
    toAccount: null,
    memo: null,
    tags: [],
    installmentMonths: null,
    installmentCurrent: null,
    status: "applied",
    recurringId: null,
    createdAt: "2026-07-15T00:00:00Z",
    updatedAt: "2026-07-15T00:00:00Z",
    ...overrides,
  }
}

function page(items: TransactionDto[], pageNo: number): MonthPage {
  return { items, total: items.length, page: pageNo, limit: 20 }
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { queryClient, wrapper }
}

const YM = "2026-07"

describe("useUpdateTransaction — 다중 page 낙관적 업데이트", () => {
  beforeEach(() => vi.clearAllMocks())

  it("캐시된 page1/2/3 전체에서 대상 id를 찾아 치환한다 (2페이지에 있는 항목)", async () => {
    const target = tx({ id: "t-target", date: "2026-07-05", amount: 1000 })
    const { queryClient, wrapper } = createWrapper()
    queryClient.setQueryData(qk.transactions.monthPage(YM, 1), page([tx({ id: "t1" })], 1))
    queryClient.setQueryData(qk.transactions.monthPage(YM, 2), page([target], 2))
    queryClient.setQueryData(qk.transactions.monthPage(YM, 3), page([tx({ id: "t3" })], 3))

    const merged = { ...target, amount: 2000 }
    vi.mocked(api.updateTransaction).mockResolvedValue(merged)

    const { result } = renderHook(() => useUpdateTransaction(), { wrapper })
    act(() =>
      result.current.mutate({
        id: "t-target",
        input: { amount: 2000 },
        previous: target,
      }),
    )

    await waitFor(() =>
      expect(
        queryClient.getQueryData<MonthPage>(qk.transactions.monthPage(YM, 2))?.items[0]
          .amount,
      ).toBe(2000),
    )

    // page1·page3은 대상 id가 없으므로 원래 항목이 그대로 유지된다
    expect(
      queryClient.getQueryData<MonthPage>(qk.transactions.monthPage(YM, 1))?.items[0].id,
    ).toBe("t1")
    expect(
      queryClient.getQueryData<MonthPage>(qk.transactions.monthPage(YM, 3))?.items[0].id,
    ).toBe("t3")
  })

  it("월 이동 실패 시 구 월의 여러 page + 신 월 page를 모두 롤백한다", async () => {
    const oldYm = "2026-07"
    const newYm = "2026-08"
    const target = tx({ id: "t-move", date: "2026-07-05", amount: 1000 })
    const { queryClient, wrapper } = createWrapper()
    queryClient.setQueryData(qk.transactions.monthPage(oldYm, 1), page([tx({ id: "keep1" })], 1))
    queryClient.setQueryData(qk.transactions.monthPage(oldYm, 2), page([target], 2))
    const newYmPage1Original = page([tx({ id: "existing-in-new-ym" })], 1)
    queryClient.setQueryData(qk.transactions.monthPage(newYm, 1), newYmPage1Original)

    vi.mocked(api.updateTransaction).mockRejectedValue(new Error("network"))

    const { result } = renderHook(() => useUpdateTransaction(), { wrapper })
    act(() =>
      result.current.mutate({
        id: "t-move",
        input: { date: "2026-08-01" },
        previous: target,
      }),
    )

    await waitFor(() => expect(result.current.isError).toBe(true))

    // 구 월 page2: 낙관적 제거가 원복되어 target이 다시 존재한다
    expect(
      queryClient
        .getQueryData<MonthPage>(qk.transactions.monthPage(oldYm, 2))
        ?.items.map((item) => item.id),
    ).toEqual(["t-move"])
    // 구 월 page1은 애초에 영향받지 않았어야 한다
    expect(
      queryClient.getQueryData<MonthPage>(qk.transactions.monthPage(oldYm, 1))?.items[0].id,
    ).toBe("keep1")
    // 신 월 page1은 원래 스냅샷 그대로 복원된다
    expect(queryClient.getQueryData<MonthPage>(qk.transactions.monthPage(newYm, 1))).toEqual(
      newYmPage1Original,
    )
  })

  it("월 이동 시 신 월(newYm)도 스냅샷 전에 cancelQueries로 취소한다 (in-flight refetch와의 경합 방지)", async () => {
    const oldYm = "2026-07"
    const newYm = "2026-08"
    const target = tx({ id: "t-move2", date: "2026-07-05" })
    const { queryClient, wrapper } = createWrapper()
    queryClient.setQueryData(qk.transactions.monthPage(oldYm, 1), page([target], 1))
    queryClient.setQueryData(qk.transactions.monthPage(newYm, 1), page([], 1))
    const cancelSpy = vi.spyOn(queryClient, "cancelQueries")

    vi.mocked(api.updateTransaction).mockResolvedValue({
      ...target,
      date: "2026-08-01",
    })

    const { result } = renderHook(() => useUpdateTransaction(), { wrapper })
    act(() =>
      result.current.mutate({
        id: "t-move2",
        input: { date: "2026-08-01" },
        previous: target,
      }),
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(cancelSpy).toHaveBeenCalledWith({ queryKey: qk.transactions.month(oldYm) })
    expect(cancelSpy).toHaveBeenCalledWith({ queryKey: qk.transactions.month(newYm) })
  })
})

describe("useDeleteTransaction — 다중 page 낙관적 업데이트", () => {
  beforeEach(() => vi.clearAllMocks())

  it("캐시된 모든 page에서 대상 id를 제거한다 (3페이지에 있는 항목)", async () => {
    const target = tx({ id: "t-del", date: "2026-07-01" })
    const { queryClient, wrapper } = createWrapper()
    queryClient.setQueryData(qk.transactions.monthPage(YM, 1), page([tx({ id: "t1" })], 1))
    queryClient.setQueryData(qk.transactions.monthPage(YM, 3), page([target], 3))

    vi.mocked(api.deleteTransaction).mockResolvedValue({ id: "t-del" })

    const { result } = renderHook(() => useDeleteTransaction(), { wrapper })
    act(() => result.current.mutate(target))

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const page3 = queryClient.getQueryData<MonthPage>(qk.transactions.monthPage(YM, 3))
    expect(page3?.items).toHaveLength(0)
    expect(page3?.total).toBe(0)
    // page1은 영향받지 않는다
    expect(
      queryClient.getQueryData<MonthPage>(qk.transactions.monthPage(YM, 1))?.items,
    ).toHaveLength(1)
  })
})

describe("useCreateTransaction — monthPage(ym, 1) 전용 낙관적 삽입", () => {
  beforeEach(() => vi.clearAllMocks())

  it("생성은 1페이지 캐시에만 삽입되고 다른 page는 영향받지 않는다", async () => {
    const { queryClient, wrapper } = createWrapper()
    queryClient.setQueryData(qk.transactions.monthPage(YM, 1), page([tx({ id: "old1" })], 1))
    queryClient.setQueryData(qk.transactions.monthPage(YM, 2), page([tx({ id: "old2" })], 2))

    const created = tx({ id: "server-id", date: "2026-07-20", amount: 5000 })
    vi.mocked(api.createTransaction).mockResolvedValue(created)

    const { result } = renderHook(() => useCreateTransaction(), { wrapper })
    act(() =>
      result.current.mutate({
        type: "expense",
        amount: 5000,
        description: "신규",
        date: "2026-07-20",
        categoryId: null,
        accountId: "acc-a",
      }),
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const page1 = queryClient.getQueryData<MonthPage>(qk.transactions.monthPage(YM, 1))
    expect(page1?.items).toHaveLength(2)
    expect(page1?.items.some((item) => item.id === "server-id")).toBe(true)

    // page2는 생성 낙관적 삽입의 영향을 받지 않는다
    const page2 = queryClient.getQueryData<MonthPage>(qk.transactions.monthPage(YM, 2))
    expect(page2?.items.map((item) => item.id)).toEqual(["old2"])
  })

  it("1페이지가 캐시에 없으면 아무 것도 만들어내지 않는다 (크래시 없음)", async () => {
    const { queryClient, wrapper } = createWrapper()
    const created = tx({ id: "server-id-2", date: "2026-07-20" })
    vi.mocked(api.createTransaction).mockResolvedValue(created)

    const { result } = renderHook(() => useCreateTransaction(), { wrapper })
    act(() =>
      result.current.mutate({
        type: "expense",
        amount: 3000,
        description: "신규2",
        date: "2026-07-20",
        categoryId: null,
        accountId: "acc-a",
      }),
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(
      queryClient.getQueryData<MonthPage>(qk.transactions.monthPage(YM, 1)),
    ).toBeUndefined()
  })
})
