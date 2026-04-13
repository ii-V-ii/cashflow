import { z } from 'zod'

const forecastAssumptionsSchema = z.object({
  incomeGrowthRate: z.number().min(-100).max(1000).optional(),
  expenseGrowthRate: z.number().min(-100).max(1000).optional(),
  inflationRate: z.number().min(-50).max(100).optional(),
  assetGrowthRates: z.record(z.string(), z.number().min(-100).max(1000)).optional(),
})

export const createForecastScenarioSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional().default(null),
  assumptions: forecastAssumptionsSchema.nullable().optional().default(null),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export const updateForecastScenarioSchema = createForecastScenarioSchema.partial()

export const runForecastSchema = z.object({
  scenarioId: z.string().min(1),
})

export type CreateForecastScenarioInput = z.infer<typeof createForecastScenarioSchema>
export type UpdateForecastScenarioInput = z.infer<typeof updateForecastScenarioSchema>
export type RunForecastInput = z.infer<typeof runForecastSchema>
