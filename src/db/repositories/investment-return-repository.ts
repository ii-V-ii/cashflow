import { eq, and } from 'drizzle-orm'
import { getDb } from '../index'
import { investmentReturns } from '../schema'
import { generateId } from '../../lib/utils'
import type { CreateInvestmentReturnInput, UpdateInvestmentReturnInput } from '../../lib/validators'

export async function findAllInvestmentReturns() {
  const db = getDb()
  return db
    .select()
    .from(investmentReturns)
    .orderBy(investmentReturns.year, investmentReturns.month)
}

export async function findInvestmentReturnById(id: string) {
  const db = getDb()
  const rows = await db.select().from(investmentReturns).where(eq(investmentReturns.id, id))
  return rows[0] ?? null
}

export async function findInvestmentReturnsByAssetId(assetId: string) {
  const db = getDb()
  return db
    .select()
    .from(investmentReturns)
    .where(eq(investmentReturns.assetId, assetId))
    .orderBy(investmentReturns.year, investmentReturns.month)
}

export async function findInvestmentReturnsByPeriod(year: number, month?: number) {
  const db = getDb()
  if (month !== undefined) {
    return db
      .select()
      .from(investmentReturns)
      .where(and(eq(investmentReturns.year, year), eq(investmentReturns.month, month)))
  }
  return db
    .select()
    .from(investmentReturns)
    .where(eq(investmentReturns.year, year))
    .orderBy(investmentReturns.month)
}

export async function findInvestmentReturnsByAssetAndPeriod(
  assetId: string,
  year: number,
  month?: number,
) {
  const db = getDb()
  if (month !== undefined) {
    return db
      .select()
      .from(investmentReturns)
      .where(
        and(
          eq(investmentReturns.assetId, assetId),
          eq(investmentReturns.year, year),
          eq(investmentReturns.month, month),
        ),
      )
  }
  return db
    .select()
    .from(investmentReturns)
    .where(and(eq(investmentReturns.assetId, assetId), eq(investmentReturns.year, year)))
    .orderBy(investmentReturns.month)
}

export async function createInvestmentReturn(input: CreateInvestmentReturnInput) {
  const db = getDb()
  const now = new Date().toISOString()
  const id = generateId()

  await db.insert(investmentReturns)
    .values({
      id,
      assetId: input.assetId,
      year: input.year,
      month: input.month,
      investedAmount: input.investedAmount ?? 0,
      dividendIncome: input.dividendIncome ?? 0,
      realizedGain: input.realizedGain ?? 0,
      unrealizedGain: input.unrealizedGain ?? 0,
      returnRate: input.returnRate ?? null,
      memo: input.memo ?? null,
      createdAt: now,
      updatedAt: now,
    })

  return (await findInvestmentReturnById(id))!
}

export async function updateInvestmentReturn(id: string, input: UpdateInvestmentReturnInput) {
  const db = getDb()
  const existing = await findInvestmentReturnById(id)
  if (!existing) return null

  const now = new Date().toISOString()

  await db.update(investmentReturns)
    .set({
      ...(input.investedAmount !== undefined && { investedAmount: input.investedAmount }),
      ...(input.dividendIncome !== undefined && { dividendIncome: input.dividendIncome }),
      ...(input.realizedGain !== undefined && { realizedGain: input.realizedGain }),
      ...(input.unrealizedGain !== undefined && { unrealizedGain: input.unrealizedGain }),
      ...(input.returnRate !== undefined && { returnRate: input.returnRate }),
      ...(input.memo !== undefined && { memo: input.memo }),
      updatedAt: now,
    })
    .where(eq(investmentReturns.id, id))

  return (await findInvestmentReturnById(id))!
}

export async function deleteInvestmentReturn(id: string) {
  const db = getDb()
  const existing = await findInvestmentReturnById(id)
  if (!existing) return false

  await db.delete(investmentReturns).where(eq(investmentReturns.id, id))
  return true
}
