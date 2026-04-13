import { eq, isNull, and, sql } from 'drizzle-orm'
import { getDb } from '../index'
import { categories, transactions } from '../schema'
import { generateId } from '../../lib/utils'
import type { CreateCategoryInput, UpdateCategoryInput } from '../../lib/validators'
import type { CategoryWithChildren } from '../../types'

export async function findAllCategories() {
  const db = getDb()
  return db
    .select()
    .from(categories)
    .orderBy(categories.type, categories.sortOrder)
}

export async function findCategoryById(id: string) {
  const db = getDb()
  const rows = await db.select().from(categories).where(eq(categories.id, id))
  return rows[0] ?? null
}

export async function findCategoriesByType(type: 'income' | 'expense') {
  const db = getDb()
  return db
    .select()
    .from(categories)
    .where(eq(categories.type, type))
    .orderBy(categories.sortOrder)
}

export async function findSubcategories(parentId: string) {
  const db = getDb()
  return db
    .select()
    .from(categories)
    .where(eq(categories.parentId, parentId))
    .orderBy(categories.sortOrder)
}

export async function findAllGrouped(): Promise<CategoryWithChildren[]> {
  const all = await findAllCategories()

  const parents = all.filter(c => c.parentId === null)
  const childMap = new Map<string, typeof all>()

  for (const child of all.filter(c => c.parentId !== null)) {
    const existing = childMap.get(child.parentId!) ?? []
    childMap.set(child.parentId!, [...existing, child])
  }

  return parents.map(parent => ({
    ...parent,
    children: childMap.get(parent.id) ?? [],
  }))
}

export async function getNextSortOrder(parentId: string | null, type: 'income' | 'expense'): Promise<number> {
  const db = getDb()
  const condition = parentId
    ? and(eq(categories.parentId, parentId), eq(categories.type, type))
    : and(isNull(categories.parentId), eq(categories.type, type))

  const rows = await db
    .select({ maxOrder: sql<number>`coalesce(max(${categories.sortOrder}), -1)`.as('maxOrder') })
    .from(categories)
    .where(condition)

  return (rows[0]?.maxOrder ?? -1) + 1
}

export async function createCategory(input: CreateCategoryInput) {
  const db = getDb()
  const id = generateId()
  const sortOrder = input.sortOrder ?? await getNextSortOrder(input.parentId ?? null, input.type)

  await db.insert(categories)
    .values({
      id,
      name: input.name,
      type: input.type,
      icon: input.icon ?? null,
      color: input.color ?? null,
      parentId: input.parentId ?? null,
      sortOrder,
    })

  return (await findCategoryById(id))!
}

export async function updateCategory(id: string, input: UpdateCategoryInput) {
  const db = getDb()
  const existing = await findCategoryById(id)
  if (!existing) return null

  await db.update(categories)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.type !== undefined && { type: input.type }),
      ...(input.icon !== undefined && { icon: input.icon }),
      ...(input.color !== undefined && { color: input.color }),
      ...(input.parentId !== undefined && { parentId: input.parentId }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
    })
    .where(eq(categories.id, id))

  return (await findCategoryById(id))!
}

export async function hasTransactions(categoryId: string): Promise<boolean> {
  const db = getDb()
  const rows = await db
    .select({ count: sql<number>`count(*)`.as('count') })
    .from(transactions)
    .where(eq(transactions.categoryId, categoryId))
  return (rows[0]?.count ?? 0) > 0
}

export async function deleteCategory(id: string): Promise<{ deleted: boolean; error?: string }> {
  const db = getDb()
  const existing = await findCategoryById(id)
  if (!existing) return { deleted: false, error: 'NOT_FOUND' }

  // 대분류인 경우: 소분류 확인
  const children = await findSubcategories(id)

  // 소분류 중 거래가 있는 것이 있는지 확인
  for (const child of children) {
    if (await hasTransactions(child.id)) {
      return { deleted: false, error: `소분류 "${child.name}"에 거래가 존재하여 삭제할 수 없습니다` }
    }
  }

  // 본인에게 거래가 있는지 확인
  if (await hasTransactions(id)) {
    return { deleted: false, error: '이 카테고리에 거래가 존재하여 삭제할 수 없습니다' }
  }

  await db.transaction(async (tx) => {
    // 소분류 먼저 삭제
    for (const child of children) {
      await tx.delete(categories).where(eq(categories.id, child.id))
    }
    // 본인 삭제
    await tx.delete(categories).where(eq(categories.id, id))
  })

  return { deleted: true }
}
