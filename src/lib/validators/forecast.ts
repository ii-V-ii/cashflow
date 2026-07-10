import { z } from "zod"

import { dateString } from "./common"

/** 예측 가정치 (API.md §13.1) */
export const forecastAssumptionsSchema = z.object({
  incomeGrowthRate: z.number().min(-100).max(1000).optional(),
  expenseGrowthRate: z.number().min(-100).max(1000).optional(),
  inflationRate: z.number().min(-50).max(100).optional(),
  assetGrowthRates: z.record(z.string(), z.number().min(-100).max(1000)).optional(),
})

/** 날짜 순서 검증 — DB CHECK(end_date > start_date)를 400으로 선반영 */
function endAfterStart(data: { startDate?: string; endDate?: string }): boolean {
  if (!data.startDate || !data.endDate) return true
  return data.endDate > data.startDate
}

const DATE_ORDER_MESSAGE = "종료일은 시작일보다 늦어야 합니다"

/** 예측 기간 상한(개월) — 과대 계산·과대 결과 저장 방지. run 서비스에서 재검증 */
export const MAX_FORECAST_MONTHS = 120

/** 시작월→종료월 개월 차 (YYYY-MM 기준, 미완성 입력은 통과) */
function withinMaxMonths(data: { startDate?: string; endDate?: string }): boolean {
  if (!data.startDate || !data.endDate) return true
  return monthSpan(data.startDate, data.endDate) <= MAX_FORECAST_MONTHS
}

export function monthSpan(startDate: string, endDate: string): number {
  const [startYear, startMonth] = startDate.split("-").map(Number)
  const [endYear, endMonth] = endDate.split("-").map(Number)
  return (endYear - startYear) * 12 + (endMonth - startMonth)
}

const MAX_MONTHS_MESSAGE = `예측 기간은 최대 ${MAX_FORECAST_MONTHS}개월입니다`

/** POST /forecast/scenarios 본문 (API.md §13.2) */
export const createForecastScenarioSchema = z
  .object({
    name: z.string().min(1, "이름을 입력하세요").max(100),
    description: z.string().max(500).nullable().optional().default(null),
    assumptions: forecastAssumptionsSchema.nullable().optional().default(null),
    startDate: dateString,
    endDate: dateString,
  })
  .refine(endAfterStart, { message: DATE_ORDER_MESSAGE, path: ["endDate"] })
  .refine(withinMaxMonths, { message: MAX_MONTHS_MESSAGE, path: ["endDate"] })

/** PATCH /forecast/scenarios/{id} 본문 — partial (API.md §13.4) */
export const updateForecastScenarioSchema = z
  .object({
    name: z.string().min(1, "이름을 입력하세요").max(100),
    description: z.string().max(500).nullable(),
    assumptions: forecastAssumptionsSchema.nullable(),
    startDate: dateString,
    endDate: dateString,
  })
  .partial()
  .refine(endAfterStart, { message: DATE_ORDER_MESSAGE, path: ["endDate"] })
  .refine(withinMaxMonths, { message: MAX_MONTHS_MESSAGE, path: ["endDate"] })

/** POST /forecast/run 본문 (API.md §13.6) */
export const runForecastSchema = z.object({
  scenarioId: z.uuid(),
})

/** GET /forecast/results 쿼리 (API.md §13.7) */
export const forecastResultsQuerySchema = z.object({
  scenarioId: z.uuid(),
})

/** GET /export/transactions 쿼리 (API.md §15.1) */
export const exportTransactionsQuerySchema = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
})

export type ForecastAssumptionsInput = z.infer<typeof forecastAssumptionsSchema>
export type CreateForecastScenarioParsed = z.output<typeof createForecastScenarioSchema>
export type UpdateForecastScenarioInput = z.infer<typeof updateForecastScenarioSchema>
export type RunForecastInput = z.infer<typeof runForecastSchema>
export type ExportTransactionsQuery = z.infer<typeof exportTransactionsQuerySchema>
