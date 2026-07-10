"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  createForecastScenario,
  deleteForecastScenario,
  getForecastResults,
  getForecastScenarios,
  runForecast,
  type CreateForecastScenarioInput,
} from "@/features/forecast/api"
import { qk } from "@/lib/query-keys"
import { useToastStore } from "@/stores/toast-store"

const SCENARIOS_STALE_TIME_MS = 30_000

export function useForecastScenarios() {
  return useQuery({
    queryKey: qk.forecast.scenarios(),
    queryFn: getForecastScenarios,
    staleTime: SCENARIOS_STALE_TIME_MS,
  })
}

/** 저장된 결과 스냅샷 — 없으면 빈 배열(run 유도, API.md §13.7) */
export function useForecastResults(scenarioId: string | null) {
  return useQuery({
    queryKey: qk.forecast.results(scenarioId ?? "none"),
    queryFn: () => getForecastResults(scenarioId as string),
    enabled: scenarioId !== null,
  })
}

/** 시나리오 생성/삭제/실행 — 실행 결과는 응답 그대로 캐시에 반영 (서버 상태) */
export function useForecastMutations() {
  const queryClient = useQueryClient()
  const showToast = useToastStore((state) => state.show)

  const invalidateScenarios = () => {
    void queryClient.invalidateQueries({ queryKey: qk.forecast.scenarios() })
  }
  const onError = (error: Error) => showToast(error.message, "error")

  const create = useMutation({
    mutationFn: (input: CreateForecastScenarioInput) => createForecastScenario(input),
    onSuccess: invalidateScenarios,
    onError,
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteForecastScenario(id),
    onSuccess: (_data, id) => {
      invalidateScenarios()
      queryClient.removeQueries({ queryKey: qk.forecast.results(id) })
    },
    onError,
  })

  const run = useMutation({
    mutationFn: (scenarioId: string) => runForecast(scenarioId),
    onSuccess: (data) => {
      // run 응답이 곧 저장된 서버 상태 스냅샷 — 재조회 없이 캐시 갱신
      queryClient.setQueryData(qk.forecast.results(data.scenarioId), data.results)
    },
    onError,
  })

  return { create, remove, run }
}
