import "server-only"

import type postgres from "postgres"

import type {
  CreateCategoryParsed,
  ListCategoriesQuery,
  ReorderInput,
  UpdateCategoryInput,
} from "@/lib/validators"
import { ApiError } from "@/server/api-errors"
import { getDb } from "@/server/db/client"
import type { CategoryDto, CategoryTreeDto } from "@/types/api"

type Row = postgres.Row

function mapCategoryRow(row: Row): CategoryDto {
  return {
    id: row.id as string,
    name: row.name as string,
    type: row.type as CategoryDto["type"],
    expenseKind: (row.expense_kind as CategoryDto["expenseKind"]) ?? null,
    icon: (row.icon as string | null) ?? null,
    color: (row.color as string | null) ?? null,
    parentId: (row.parent_id as string | null) ?? null,
    sortOrder: Number(row.sort_order),
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  }
}

function buildTree(categories: CategoryDto[]): CategoryTreeDto[] {
  const parents = categories.filter((category) => category.parentId === null)
  return parents.map((parent) => ({
    ...parent,
    children: categories.filter((category) => category.parentId === parent.id),
  }))
}

/** GET /categories — 전체 SELECT 1왕복, 트리 조립은 서비스 계층 (API.md §4.1) */
export async function listCategories(
  query: ListCategoriesQuery,
): Promise<CategoryDto[] | CategoryTreeDto[]> {
  const sql = getDb()
  const rows = await sql`
    SELECT * FROM categories
    WHERE TRUE ${query.type ? sql`AND type = ${query.type}` : sql``}
    ORDER BY sort_order, created_at
  `
  const categories = rows.map(mapCategoryRow)
  return query.grouped ? buildTree(categories) : categories
}

/** 대분류(부모가 또 부모를 가지면 3단계) 검증 — 422 MAX_DEPTH_EXCEEDED (API.md §4.2) */
async function assertParentDepth(parentId: string): Promise<void> {
  const sql = getDb()
  const rows = await sql`SELECT parent_id FROM categories WHERE id = ${parentId}`
  if (rows.length === 0) {
    throw new ApiError(404, "NOT_FOUND", `상위 카테고리를 찾을 수 없습니다: ${parentId}`)
  }
  if (rows[0].parent_id !== null) {
    throw new ApiError(422, "MAX_DEPTH_EXCEEDED", "카테고리는 2단계까지만 허용됩니다")
  }
}

/** POST /categories (API.md §4.2) */
export async function createCategory(input: CreateCategoryParsed): Promise<CategoryDto> {
  if (input.parentId) {
    await assertParentDepth(input.parentId)
  }

  const sql = getDb()
  const rows = await sql`
    INSERT INTO categories (name, type, expense_kind, icon, color, parent_id, sort_order)
    VALUES (
      ${input.name}, ${input.type}, ${input.expenseKind ?? null},
      ${input.icon ?? null}, ${input.color ?? null}, ${input.parentId ?? null},
      ${input.sortOrder}
    )
    RETURNING *
  `
  return mapCategoryRow(rows[0])
}

const UPDATE_COLUMN_MAP: Record<string, string> = {
  name: "name",
  type: "type",
  expenseKind: "expense_kind",
  icon: "icon",
  color: "color",
  parentId: "parent_id",
  sortOrder: "sort_order",
}

/** PATCH /categories/{id} — 미전달 필드 보존 (API.md §4.3) */
export async function updateCategory(
  id: string,
  input: UpdateCategoryInput,
): Promise<CategoryDto> {
  if (input.parentId) {
    await assertParentDepth(input.parentId)
  }

  const data: Record<string, unknown> = {}
  for (const [key, column] of Object.entries(UPDATE_COLUMN_MAP)) {
    const value = (input as Record<string, unknown>)[key]
    if (value !== undefined) data[column] = value
  }

  const sql = getDb()
  if (Object.keys(data).length === 0) {
    const rows = await sql`SELECT * FROM categories WHERE id = ${id}`
    if (rows.length === 0) {
      throw new ApiError(404, "NOT_FOUND", `카테고리를 찾을 수 없습니다: ${id}`)
    }
    return mapCategoryRow(rows[0])
  }

  const rows = await sql`
    UPDATE categories SET ${sql(data)} WHERE id = ${id} RETURNING *
  `
  if (rows.length === 0) {
    throw new ApiError(404, "NOT_FOUND", `카테고리를 찾을 수 없습니다: ${id}`)
  }
  return mapCategoryRow(rows[0])
}

/** DELETE /categories/{id} — 거래 참조 시 409 REFERENCE_EXISTS (API.md §4.4) */
export async function deleteCategory(id: string): Promise<{ id: string }> {
  const sql = getDb()
  const referencedRows = await sql`
    SELECT EXISTS(SELECT 1 FROM transactions WHERE category_id = ${id}) AS referenced
  `
  if (referencedRows[0].referenced) {
    throw new ApiError(409, "REFERENCE_EXISTS", "거래가 참조 중인 카테고리는 삭제할 수 없습니다")
  }

  const rows = await sql`DELETE FROM categories WHERE id = ${id} RETURNING id`
  if (rows.length === 0) {
    throw new ApiError(404, "NOT_FOUND", `카테고리를 찾을 수 없습니다: ${id}`)
  }
  return { id }
}

/** PATCH /categories/order — 3.6과 동일 unnest 단일 UPDATE (API.md §4.5) */
export async function reorderCategories(
  input: ReorderInput,
): Promise<{ updated: number }> {
  const sql = getDb()
  const ids = input.items.map((item) => item.id)
  const orders = input.items.map((item) => item.sortOrder)
  const result = await sql`
    UPDATE categories c SET sort_order = v.sort_order
    FROM (SELECT unnest(${ids}::uuid[]) AS id, unnest(${orders}::int[]) AS sort_order) v
    WHERE c.id = v.id
  `
  return { updated: result.count }
}
