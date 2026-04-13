"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiGet, apiPost, apiDelete } from "@/lib/api-client"
import type { ForecastScenario, ForecastSummary } from "@/types"

const FORECAST_KEY = ["forecast"] as const

export function useForecastScenarios() {
  return useQuery({
    queryKey: [...FORECAST_KEY, "scenarios"],
    queryFn: () => apiGet<ForecastScenario[]>("/api/forecast/scenarios"),
  })
}

export function useForecastResult(scenarioId: string | null) {
  return useQuery({
    queryKey: [...FORECAST_KEY, "result", scenarioId],
    queryFn: () =>
      apiGet<ForecastSummary>(
        `/api/forecast/results?scenarioId=${scenarioId}`,
      ),
    enabled: !!scenarioId,
  })
}

export function useCreateScenario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiPost<ForecastScenario>("/api/forecast/scenarios", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: FORECAST_KEY })
    },
  })
}

export function useDeleteScenario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiDelete<{ deleted: boolean }>(`/api/forecast/scenarios/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: FORECAST_KEY })
    },
  })
}

export function useRunForecast() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ scenarioId, months }: { scenarioId: string; months: number }) =>
      apiPost<ForecastSummary>("/api/forecast/run", { scenarioId, months }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: FORECAST_KEY })
    },
  })
}
