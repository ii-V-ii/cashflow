import type { z } from "zod"

import { apiFetch } from "@/lib/api/http"
import type { createForecastScenarioSchema } from "@/lib/validators/forecast"
import type {
  ForecastResultDto,
  ForecastScenarioDto,
  RunForecastResponseDto,
} from "@/types/api"

export type CreateForecastScenarioInput = z.input<typeof createForecastScenarioSchema>

export function getForecastScenarios(): Promise<ForecastScenarioDto[]> {
  return apiFetch("/api/v1/forecast/scenarios")
}

export function createForecastScenario(
  input: CreateForecastScenarioInput,
): Promise<ForecastScenarioDto> {
  return apiFetch("/api/v1/forecast/scenarios", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function deleteForecastScenario(id: string): Promise<{ id: string }> {
  return apiFetch(`/api/v1/forecast/scenarios/${id}`, { method: "DELETE" })
}

export function runForecast(scenarioId: string): Promise<RunForecastResponseDto> {
  return apiFetch("/api/v1/forecast/run", {
    method: "POST",
    body: JSON.stringify({ scenarioId }),
  })
}

export function getForecastResults(scenarioId: string): Promise<ForecastResultDto[]> {
  return apiFetch(`/api/v1/forecast/results?scenarioId=${scenarioId}`)
}
