import { eq, sql } from 'drizzle-orm'
import { getDb } from '../index'
import { assetCategories } from '../schema'
import { generateId } from '../../lib/utils'
import type { CreateAssetCategoryInput, UpdateAssetCategoryInput } from '../../lib/validators'

export async function findAllAssetCategories() {
  const db = getDb()
  return db
    .select()
    .from(assetCategories)
    .orderBy(assetCategories.sortOrder)
}

export async function findAssetCategoryById(id: string) {
  const db = getDb()
  const rows = await db.select().from(assetCategories).where(eq(assetCategories.id, id))
  return rows[0] ?? null
}

export async function findAssetCategoriesByKind(kind: 'financial' | 'non_financial') {
  const db = getDb()
  return db
    .select()
    .from(assetCategories)
    .where(eq(assetCategories.kind, kind))
    .orderBy(assetCategories.sortOrder)
}

export async function createAssetCategory(input: CreateAssetCategoryInput) {
  const db = getDb()
  const id = generateId()

  const sortOrder = input.sortOrder ?? await getNextSortOrder()

  await db.insert(assetCategories)
    .values({
      id,
      name: input.name,
      kind: input.kind,
      icon: input.icon ?? null,
      color: input.color ?? null,
      sortOrder,
    })

  return (await findAssetCategoryById(id))!
}

export async function updateAssetCategory(id: string, input: UpdateAssetCategoryInput) {
  const db = getDb()
  const existing = await findAssetCategoryById(id)
  if (!existing) return null

  await db.update(assetCategories)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.kind !== undefined && { kind: input.kind }),
      ...(input.icon !== undefined && { icon: input.icon }),
      ...(input.color !== undefined && { color: input.color }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
    })
    .where(eq(assetCategories.id, id))

  return (await findAssetCategoryById(id))!
}

export async function deleteAssetCategory(id: string) {
  const db = getDb()
  const existing = await findAssetCategoryById(id)
  if (!existing) return false

  await db.delete(assetCategories).where(eq(assetCategories.id, id))
  return true
}

async function getNextSortOrder(): Promise<number> {
  const db = getDb()
  const rows = await db
    .select({ maxOrder: sql<number>`coalesce(max(${assetCategories.sortOrder}), -1)`.as('maxOrder') })
    .from(assetCategories)
  return (rows[0]?.maxOrder ?? -1) + 1
}
