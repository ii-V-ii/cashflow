import { eq, and, desc, sql } from 'drizzle-orm'
import { getDb } from '../index'
import { assets, assetCategories, assetValuations } from '../schema'
import { generateId } from '../../lib/utils'
import type { CreateAssetInput, UpdateAssetInput, CreateValuationInput } from '../../lib/validators'

// === Assets CRUD ===

export async function findAllAssets(activeOnly = true) {
  const db = getDb()
  if (activeOnly) {
    return db
      .select()
      .from(assets)
      .where(eq(assets.isActive, true))
      .orderBy(assets.name)
  }
  return db.select().from(assets).orderBy(assets.name)
}

export async function findAssetById(id: string) {
  const db = getDb()
  const rows = await db.select().from(assets).where(eq(assets.id, id))
  return rows[0] ?? null
}

export async function findAssetsByAssetCategoryKind(kind: 'financial' | 'non_financial') {
  const db = getDb()
  return db
    .select({ asset: assets })
    .from(assets)
    .innerJoin(assetCategories, eq(assets.assetCategoryId, assetCategories.id))
    .where(and(eq(assetCategories.kind, kind), eq(assets.isActive, true)))
    .orderBy(assets.name)
    .then(rows => rows.map(r => r.asset))
}

export async function createAsset(input: CreateAssetInput) {
  const db = getDb()
  const id = generateId()

  const [result] = await db.insert(assets)
    .values({
      id,
      name: input.name,
      assetCategoryId: input.assetCategoryId,
      acquisitionDate: input.acquisitionDate,
      acquisitionCost: input.acquisitionCost,
      currentValue: input.currentValue,
      institution: input.institution ?? null,
      memo: input.memo ?? null,
      isActive: input.isActive ?? true,
      metadata: input.metadata ?? null,
    })
    .returning()

  return result
}

export async function updateAsset(id: string, input: UpdateAssetInput) {
  const db = getDb()
  const existing = await findAssetById(id)
  if (!existing) return null

  const [result] = await db.update(assets)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.assetCategoryId !== undefined && { assetCategoryId: input.assetCategoryId }),
      ...(input.acquisitionDate !== undefined && { acquisitionDate: input.acquisitionDate }),
      ...(input.acquisitionCost !== undefined && { acquisitionCost: input.acquisitionCost }),
      ...(input.currentValue !== undefined && { currentValue: input.currentValue }),
      ...(input.institution !== undefined && { institution: input.institution }),
      ...(input.memo !== undefined && { memo: input.memo }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      ...(input.metadata !== undefined && { metadata: input.metadata }),
    })
    .where(eq(assets.id, id))
    .returning()

  return result
}

export async function deleteAsset(id: string) {
  const db = getDb()
  const existing = await findAssetById(id)
  if (!existing) return false

  await db.delete(assets).where(eq(assets.id, id))
  return true
}

export async function updateCurrentValue(id: string, value: number) {
  const db = getDb()
  const existing = await findAssetById(id)
  if (!existing) return null

  const [result] = await db.update(assets)
    .set({ currentValue: value })
    .where(eq(assets.id, id))
    .returning()

  return result
}

// === Valuations ===

export async function getValuations(assetId: string) {
  const db = getDb()
  return db
    .select()
    .from(assetValuations)
    .where(eq(assetValuations.assetId, assetId))
    .orderBy(desc(assetValuations.date))
}

export async function getLatestValuation(assetId: string) {
  const db = getDb()
  const rows = await db
    .select()
    .from(assetValuations)
    .where(eq(assetValuations.assetId, assetId))
    .orderBy(desc(assetValuations.date))
    .limit(1)
  return rows[0] ?? null
}

export async function addValuation(assetId: string, input: CreateValuationInput) {
  const db = getDb()
  const id = generateId()

  // INSERT RETURNING으로 재조회 제거
  const [inserted] = await db.insert(assetValuations)
    .values({
      id,
      assetId,
      date: input.date,
      value: input.value,
      source: input.source ?? 'manual',
      memo: input.memo ?? null,
    })
    .returning()

  // 더 최근 평가가 없으면 자산 현재가치 갱신
  const laterRows = await db
    .select({ id: assetValuations.id })
    .from(assetValuations)
    .where(
      and(
        eq(assetValuations.assetId, assetId),
        sql`${assetValuations.date} > ${input.date}`,
      ),
    )
    .limit(1)

  if (laterRows.length === 0) {
    await db.update(assets)
      .set({ currentValue: input.value })
      .where(eq(assets.id, assetId))
  }

  return inserted
}
