// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/features/forecast/api", () => ({
  getForecastScenarios: vi.fn(),
  createForecastScenario: vi.fn(),
  deleteForecastScenario: vi.fn(),
  runForecast: vi.fn(),
  getForecastResults: vi.fn(),
}))

import * as api from "@/features/forecast/api"
import {
  useForecastMutations,
  useForecastResults,
} from "@/features/forecast/hooks/use-forecast"
import { qk } from "@/lib/query-keys"
import type { ForecastResultDto } from "@/types/api"

const SCENARIO_ID = "11111111-1111-4111-8111-111111111111"

const RESULTS: ForecastResultDto[] = [
  {
    ym: "2026-07",
    projectedIncome: 1,
    projectedExpense: 1,
    projectedCashflow: 1,
    projectedNetWorth: 1,
    goalProgress: null,
  },
]

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { queryClient, wrapper }
}

describe("useForecastResults", () => {
  beforeEach(() => vi.clearAllMocks())

  it("scenarioId가 null이면 조회하지 않는다", () => {
    const { wrapper } = createWrapper()
    renderHook(() => useForecastResults(null), { wrapper })
    expect(api.getForecastResults).not.toHaveBeenCalled()
  })

  it("scenarioId가 있으면 결과를 조회한다", async () => {
    vi.mocked(api.getForecastResults).mockResolvedValue(RESULTS)
    const { wrapper } = createWrapper()

    const { result } = renderHook(() => useForecastResults(SCENARIO_ID), { wrapper })

    await waitFor(() => expect(result.current.data).toEqual(RESULTS))
    expect(api.getForecastResults).toHaveBeenCalledWith(SCENARIO_ID)
  })
})

describe("useForecastMutations", () => {
  beforeEach(() => vi.clearAllMocks())

  it("run 성공 → 응답 결과를 results 캐시에 반영 (재조회 없음)", async () => {
    vi.mocked(api.runForecast).mockResolvedValue({
      scenarioId: SCENARIO_ID,
      results: RESULTS,
    })
    const { queryClient, wrapper } = createWrapper()

    const { result } = renderHook(() => useForecastMutations(), { wrapper })
    act(() => result.current.run.mutate(SCENARIO_ID))

    await waitFor(() => expect(result.current.run.isSuccess).toBe(true))
    expect(queryClient.getQueryData(qk.forecast.results(SCENARIO_ID))).toEqual(RESULTS)
  })

  it("remove 성공 → 해당 시나리오 results 캐시 제거 + scenarios 무효화", async () => {
    vi.mocked(api.deleteForecastScenario).mockResolvedValue({ id: SCENARIO_ID })
    const { queryClient, wrapper } = createWrapper()
    queryClient.setQueryData(qk.forecast.results(SCENARIO_ID), RESULTS)
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

    const { result } = renderHook(() => useForecastMutations(), { wrapper })
    act(() => result.current.remove.mutate(SCENARIO_ID))

    await waitFor(() => expect(result.current.remove.isSuccess).toBe(true))
    expect(queryClient.getQueryData(qk.forecast.results(SCENARIO_ID))).toBeUndefined()
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: qk.forecast.scenarios() })
  })

  it("create 성공 → scenarios 무효화", async () => {
    vi.mocked(api.createForecastScenario).mockResolvedValue({
      id: SCENARIO_ID,
      name: "n",
      description: null,
      assumptions: null,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    })
    const { queryClient, wrapper } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

    const { result } = renderHook(() => useForecastMutations(), { wrapper })
    act(() =>
      result.current.create.mutate({
        name: "n",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      }),
    )

    await waitFor(() => expect(result.current.create.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: qk.forecast.scenarios() })
  })

  it("run 실패 → 에러 토스트", async () => {
    vi.mocked(api.runForecast).mockRejectedValue(new Error("실행 실패"))
    const { wrapper } = createWrapper()
    const { useToastStore } = await import("@/stores/toast-store")
    useToastStore.setState({ toasts: [] })

    const { result } = renderHook(() => useForecastMutations(), { wrapper })
    act(() => result.current.run.mutate(SCENARIO_ID))

    await waitFor(() => expect(result.current.run.isError).toBe(true))
    expect(
      useToastStore.getState().toasts.some((toast) => toast.message === "실행 실패"),
    ).toBe(true)
  })
})
