import { eq, and, desc } from 'drizzle-orm'
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

  await db.insert(assets)
    .values({
      id,
      name: input.name,
      assetCategoryId: input.assetCategoryId,
      acquisitionDate: input.acquisitionDate,
      acquisitionCost: input.acquisitionCost,
      currentValue: input.currentValue,
      accountId: input.accountId ?? null,
      institution: input.institution ?? null,
      memo: input.memo ?? null,
      isActive: input.isActive ?? true,
      metadata: input.metadata ?? null,
    })

  return (await findAssetById(id))!
}

export async function updateAsset(id: string, input: UpdateAssetInput) {
  const db = getDb()
  const existing = await findAssetById(id)
  if (!existing) return null

  await db.update(assets)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.assetCategoryId !== undefined && { assetCategoryId: input.assetCategoryId }),
      ...(input.acquisitionDate !== undefined && { acquisitionDate: input.acquisitionDate }),
      ...(input.acquisitionCost !== undefined && { acquisitionCost: input.acquisitionCost }),
      ...(input.currentValue !== undefined && { currentValue: input.currentValue }),
      ...(input.accountId !== undefined && { accountId: input.accountId }),
      ...(input.institution !== undefined && { institution: input.institution }),
      ...(input.memo !== undefined && { memo: input.memo }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      ...(input.metadata !== undefined && { metadata: input.metadata }),
    })
    .where(eq(assets.id, id))

  return (await findAssetById(id))!
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

  await db.update(assets)
    .set({ currentValue: value })
    .where(eq(assets.id, id))

  return (await findAssetById(id))!
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

  await db.insert(assetValuations)
    .values({
      id,
      assetId,
      date: input.date,
      value: input.value,
      source: input.source ?? 'manual',
      memo: input.memo ?? null,
    })

  // 최신 평가인 경우 자산 현재가치도 갱신
  const latest = await getLatestValuation(assetId)
  if (latest && latest.id === id) {
    await updateCurrentValue(assetId, input.value)
  }

  const rows = await db.select().from(assetValuations).where(eq(assetValuations.id, id))
  return rows[0]!
}
