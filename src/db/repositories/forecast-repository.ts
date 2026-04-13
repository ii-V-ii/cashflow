import { eq, and, desc } from 'drizzle-orm'
import { getDb } from '../index'
import { forecastScenarios, forecastResults } from '../schema'
import { generateId } from '../../lib/utils'
import type { CreateForecastScenarioInput, UpdateForecastScenarioInput } from '../../lib/validators'

// === Scenarios ===

export async function findAllForecastScenarios() {
  const db = getDb()
  return db
    .select()
    .from(forecastScenarios)
    .orderBy(desc(forecastScenarios.createdAt))
}

export async function findForecastScenarioById(id: string) {
  const db = getDb()
  const rows = await db
    .select()
    .from(forecastScenarios)
    .where(eq(forecastScenarios.id, id))
  return rows[0] ?? null
}

export async function createForecastScenario(input: CreateForecastScenarioInput) {
  const db = getDb()
  const now = new Date().toISOString()
  const id = generateId()

  await db.insert(forecastScenarios)
    .values({
      id,
      name: input.name,
      description: input.description ?? null,
      assumptions: input.assumptions ? JSON.stringify(input.assumptions) : null,
      startDate: input.startDate,
      endDate: input.endDate,
      createdAt: now,
      updatedAt: now,
    })

  return (await findForecastScenarioById(id))!
}

export async function updateForecastScenario(id: string, input: UpdateForecastScenarioInput) {
  const db = getDb()
  const existing = await findForecastScenarioById(id)
  if (!existing) return null

  const now = new Date().toISOString()

  await db.update(forecastScenarios)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.assumptions !== undefined && {
        assumptions: input.assumptions ? JSON.stringify(input.assumptions) : null,
      }),
      ...(input.startDate !== undefined && { startDate: input.startDate }),
      ...(input.endDate !== undefined && { endDate: input.endDate }),
      updatedAt: now,
    })
    .where(eq(forecastScenarios.id, id))

  return (await findForecastScenarioById(id))!
}

export async function deleteForecastScenario(id: string) {
  const db = getDb()
  const existing = await findForecastScenarioById(id)
  if (!existing) return false

  await db.delete(forecastScenarios)
    .where(eq(forecastScenarios.id, id))
  return true
}

// === Results ===

export async function findForecastResultsByScenarioId(scenarioId: string) {
  const db = getDb()
  return db
    .select()
    .from(forecastResults)
    .where(eq(forecastResults.scenarioId, scenarioId))
    .orderBy(forecastResults.date)
}

export async function saveForecastResults(
  scenarioId: string,
  results: readonly {
    date: string
    projectedIncome: number
    projectedExpense: number
    projectedBalance: number
    projectedNetWorth: number
    details: string | null
  }[],
) {
  const db = getDb()
  const now = new Date().toISOString()

  await db.transaction(async (tx) => {
    // 기존 결과 삭제
    await tx.delete(forecastResults)
      .where(eq(forecastResults.scenarioId, scenarioId))

    // 새 결과 삽입
    for (const result of results) {
      await tx.insert(forecastResults)
        .values({
          id: generateId(),
          scenarioId,
          date: result.date,
          projectedIncome: result.projectedIncome,
          projectedExpense: result.projectedExpense,
          projectedBalance: result.projectedBalance,
          projectedNetWorth: result.projectedNetWorth,
          details: result.details,
          createdAt: now,
          updatedAt: now,
        })
    }
  })
}
