import "server-only"

import type postgres from "postgres"

import type {
  CreateAssetCategoryInput,
  UpdateAssetCategoryInput,
} from "@/lib/validators"
import { ApiError } from "@/server/api-errors"
import { getDb } from "@/server/db/client"
import type { AssetCategoryDto } from "@/types/api"

type Row = postgres.Row

const CATEGORY_COLUMNS = "id, name, kind, icon, color, sort_order, created_at, updated_at"

function mapCategoryRow(row: Row): AssetCategoryDto {
  return {
    id: row.id as string,
    name: row.name as string,
    kind: row.kind as AssetCategoryDto["kind"],
    icon: (row.icon as string | null) ?? null,
    color: (row.color as string | null) ?? null,
    sortOrder: Number(row.sort_order),
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  }
}

/** GET /asset-categories (API.md §10.1) */
export async function listAssetCategories(): Promise<AssetCategoryDto[]> {
  const sql = getDb()
  const rows = await sql`
    SELECT ${sql.unsafe(CATEGORY_COLUMNS)}
    FROM asset_categories
    ORDER BY sort_order, created_at
  `
  return rows.map(mapCategoryRow)
}

/** POST /asset-categories (API.md §10.2) */
export async function createAssetCategory(
  input: CreateAssetCategoryInput,
): Promise<AssetCategoryDto> {
  const sql = getDb()
  const rows = await sql`
    INSERT INTO asset_categories (name, kind, icon, color, sort_order)
    VALUES (${input.name}, ${input.kind}, ${input.icon ?? null},
            ${input.color ?? null}, ${input.sortOrder})
    RETURNING ${sql.unsafe(CATEGORY_COLUMNS)}
  `
  return mapCategoryRow(rows[0])
}

const UPDATE_COLUMN_MAP: Record<string, string> = {
  name: "name",
  kind: "kind",
  icon: "icon",
  color: "color",
  sortOrder: "sort_order",
}

/** PATCH /asset-categories/{id} — partial (API.md §10.3) */
export async function updateAssetCategory(
  id: string,
  input: UpdateAssetCategoryInput,
): Promise<AssetCategoryDto> {
  const data: Record<string, unknown> = {}
  for (const [key, column] of Object.entries(UPDATE_COLUMN_MAP)) {
    const value = (input as Record<string, unknown>)[key]
    if (value !== undefined) data[column] = value
  }

  const sql = getDb()
  const rows =
    Object.keys(data).length === 0
      ? await sql`
          SELECT ${sql.unsafe(CATEGORY_COLUMNS)} FROM asset_categories WHERE id = ${id}
        `
      : await sql`
          UPDATE asset_categories SET ${sql(data)} WHERE id = ${id}
          RETURNING ${sql.unsafe(CATEGORY_COLUMNS)}
        `
  if (rows.length === 0) {
    throw new ApiError(404, "NOT_FOUND", `자산 카테고리를 찾을 수 없습니다: ${id}`)
  }
  return mapCategoryRow(rows[0])
}

/** DELETE /asset-categories/{id} — 자산 참조 시 FK RESTRICT → 409 (API.md §10.4) */
export async function deleteAssetCategory(id: string): Promise<{ id: string }> {
  const sql = getDb()
  const rows = await sql`DELETE FROM asset_categories WHERE id = ${id} RETURNING id`
  if (rows.length === 0) {
    throw new ApiError(404, "NOT_FOUND", `자산 카테고리를 찾을 수 없습니다: ${id}`)
  }
  return { id }
}
