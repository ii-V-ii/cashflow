import "server-only"

import type postgres from "postgres"

import type {
  CreateAssetInput,
  CreateValuationInput,
  ListAssetsQuery,
  UpdateAssetInput,
} from "@/lib/validators"
import { ApiError } from "@/server/api-errors"
import { getDb } from "@/server/db/client"
import type {
  AssetDetailDto,
  AssetDto,
  LinkedAccountRef,
  PortfolioDto,
  ValuationDto,
} from "@/types/api"

type Row = postgres.Row

const RATE_DECIMALS = 100 // 소수 2자리

/** assets ⋈ asset_values_v ⋈ asset_categories SELECT 컬럼 (자산 별칭 인자) */
function assetColumns(alias: string): string {
  const a = alias
  return `
    ${a}.id, ${a}.name, ${a}.asset_category_id,
    ${a}.acquisition_date::text AS acquisition_date,
    ${a}.acquisition_cost, ${a}.institution, ${a}.memo, ${a}.is_active,
    ${a}.metadata, ${a}.created_at, ${a}.updated_at,
    v.current_value,
    c.name AS category_name, c.kind AS category_kind,
    c.icon AS category_icon, c.color AS category_color
  `
}

const ASSET_FROM = `
  FROM assets a
  JOIN asset_values_v v ON v.asset_id = a.id
  JOIN asset_categories c ON c.id = a.asset_category_id
`

function roundRate(value: number): number {
  return Math.round(value * RATE_DECIMALS) / RATE_DECIMALS
}

function mapAssetRow(row: Row): AssetDto {
  const acquisitionCost = Number(row.acquisition_cost)
  const currentValue = Number(row.current_value)
  const gain = currentValue - acquisitionCost
  return {
    id: row.id as string,
    name: row.name as string,
    assetCategoryId: row.asset_category_id as string,
    assetCategory: {
      id: row.asset_category_id as string,
      name: row.category_name as string,
      kind: row.category_kind as AssetDto["assetCategory"]["kind"],
      icon: (row.category_icon as string | null) ?? null,
      color: (row.category_color as string | null) ?? null,
    },
    acquisitionDate: row.acquisition_date as string,
    acquisitionCost,
    currentValue,
    gain,
    gainRate: acquisitionCost > 0 ? roundRate((gain / acquisitionCost) * 100) : 0,
    institution: (row.institution as string | null) ?? null,
    memo: (row.memo as string | null) ?? null,
    isActive: Boolean(row.is_active),
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  }
}

function mapValuationRow(row: Row): ValuationDto {
  return {
    id: row.id as string,
    date: row.date as string,
    value: Number(row.value),
    source: row.source as ValuationDto["source"],
    memo: (row.memo as string | null) ?? null,
  }
}

/** GET /assets — 1왕복 (API.md §9.1) */
export async function listAssets(query: ListAssetsQuery): Promise<AssetDto[]> {
  const sql = getDb()
  const rows = await sql`
    SELECT ${sql.unsafe(assetColumns("a"))}
    ${sql.unsafe(ASSET_FROM)}
    WHERE (${query.kind ?? null}::text IS NULL OR c.kind = ${query.kind ?? null})
      AND (${!query.activeOnly} OR a.is_active)
    ORDER BY c.sort_order, a.created_at
  `
  return rows.map(mapAssetRow)
}

/** POST /assets — asset INSERT + 최초 평가이력 INSERT 원자 (API.md §9.2) */
export async function createAsset(input: CreateAssetInput): Promise<AssetDto> {
  const sql = getDb()
  const row = await sql.begin(async (tx) => {
    const inserted = await tx`
      INSERT INTO assets (
        name, asset_category_id, acquisition_date, acquisition_cost,
        institution, memo, is_active, metadata
      ) VALUES (
        ${input.name}, ${input.assetCategoryId}, ${input.acquisitionDate},
        ${input.acquisitionCost}, ${input.institution ?? null}, ${input.memo ?? null},
        ${input.isActive}, ${input.metadata === undefined || input.metadata === null ? null : tx.json(input.metadata as never)}
      )
      RETURNING id
    `
    const assetId = inserted[0].id as string
    if (input.initialValue !== undefined) {
      await tx`
        INSERT INTO asset_valuations (asset_id, date, value, source)
        VALUES (${assetId}, ${input.acquisitionDate}, ${input.initialValue}, 'manual')
      `
    }
    const rows = await tx`
      SELECT ${tx.unsafe(assetColumns("a"))} ${tx.unsafe(ASSET_FROM)}
      WHERE a.id = ${assetId}
    `
    return rows[0]
  })
  return mapAssetRow(row)
}

/** GET /assets/{id} — 상세 1왕복: 평가 이력 + 연결 계좌 포함 (API.md §9.3) */
export async function getAssetDetail(id: string): Promise<AssetDetailDto> {
  const sql = getDb()
  const rows = await sql`
    SELECT ${sql.unsafe(assetColumns("a"))},
      COALESCE((
        SELECT json_agg(json_build_object(
          'id', av.id, 'date', av.date::text, 'value', av.value,
          'source', av.source, 'memo', av.memo
        ) ORDER BY av.date)
        FROM asset_valuations av WHERE av.asset_id = a.id
      ), '[]'::json) AS valuations,
      COALESCE((
        SELECT json_agg(json_build_object(
          'id', b.account_id, 'name', b.name, 'type', b.type,
          'balance', b.current_balance
        ) ORDER BY b.name)
        FROM accounts ac
        JOIN account_balances_v b ON b.account_id = ac.id
        WHERE ac.asset_id = a.id
      ), '[]'::json) AS linked_accounts
    ${sql.unsafe(ASSET_FROM)}
    WHERE a.id = ${id}
  `
  if (rows.length === 0) {
    throw new ApiError(404, "NOT_FOUND", `자산을 찾을 수 없습니다: ${id}`)
  }
  const row = rows[0]
  const valuations = (row.valuations as ValuationDto[]).map((valuation) => ({
    ...valuation,
    value: Number(valuation.value),
  }))
  const linkedAccounts = (row.linked_accounts as LinkedAccountRef[]).map((account) => ({
    ...account,
    balance: Number(account.balance),
  }))
  return { ...mapAssetRow(row), valuations, linkedAccounts }
}

const UPDATE_COLUMN_MAP: Record<string, string> = {
  name: "name",
  assetCategoryId: "asset_category_id",
  acquisitionDate: "acquisition_date",
  acquisitionCost: "acquisition_cost",
  institution: "institution",
  memo: "memo",
  isActive: "is_active",
  metadata: "metadata",
}

/** PATCH /assets/{id} — partial (API.md §9.4, 평가값 변경은 §9.7) */
export async function updateAsset(
  id: string,
  input: UpdateAssetInput,
): Promise<AssetDto> {
  const data: Record<string, unknown> = {}
  for (const [key, column] of Object.entries(UPDATE_COLUMN_MAP)) {
    const value = (input as Record<string, unknown>)[key]
    if (value !== undefined) data[column] = value
  }

  const sql = getDb()
  if (Object.keys(data).length === 0) {
    return getAssetDetail(id)
  }
  const rows = await sql`
    WITH u AS (
      UPDATE assets SET ${sql(data)} WHERE id = ${id} RETURNING *
    )
    SELECT ${sql.unsafe(assetColumns("u"))}
    FROM u
    JOIN asset_values_v v ON v.asset_id = u.id
    JOIN asset_categories c ON c.id = u.asset_category_id
  `
  if (rows.length === 0) {
    throw new ApiError(404, "NOT_FOUND", `자산을 찾을 수 없습니다: ${id}`)
  }
  return mapAssetRow(rows[0])
}

/** DELETE /assets/{id} — 계좌·매매 참조 시 409 (라우트 fkMeansReference, API.md §9.5) */
export async function deleteAsset(id: string): Promise<{ id: string }> {
  const sql = getDb()
  const rows = await sql`DELETE FROM assets WHERE id = ${id} RETURNING id`
  if (rows.length === 0) {
    throw new ApiError(404, "NOT_FOUND", `자산을 찾을 수 없습니다: ${id}`)
  }
  return { id }
}

/** GET /assets/portfolio — 카테고리별 도넛 (API.md §9.6) */
export async function getPortfolio(): Promise<PortfolioDto> {
  const sql = getDb()
  const rows = await sql`
    SELECT c.id AS asset_category_id, c.name, c.kind, c.color,
           COALESCE(SUM(v.current_value), 0)::bigint AS value
    FROM asset_values_v v
    JOIN asset_categories c ON c.id = v.asset_category_id
    WHERE v.is_active
    GROUP BY c.id, c.name, c.kind, c.color, c.sort_order
    ORDER BY c.sort_order, c.name
  `
  const total = rows.reduce((sum, row) => sum + Number(row.value), 0)
  return {
    total,
    byCategory: rows.map((row) => ({
      assetCategoryId: row.asset_category_id as string,
      name: row.name as string,
      kind: row.kind as PortfolioDto["byCategory"][number]["kind"],
      color: (row.color as string | null) ?? null,
      value: Number(row.value),
      ratio: total > 0 ? roundRate((Number(row.value) / total) * 100) : 0,
    })),
  }
}

async function assertAssetExists(sql: ReturnType<typeof getDb>, id: string): Promise<void> {
  const rows = await sql`SELECT 1 FROM assets WHERE id = ${id}`
  if (rows.length === 0) {
    throw new ApiError(404, "NOT_FOUND", `자산을 찾을 수 없습니다: ${id}`)
  }
}

/** GET /assets/{id}/valuations — 날짜 오름차순 (API.md §9.7) */
export async function listValuations(assetId: string): Promise<ValuationDto[]> {
  const sql = getDb()
  await assertAssetExists(sql, assetId)
  const rows = await sql`
    SELECT id, date::text AS date, value, source, memo
    FROM asset_valuations
    WHERE asset_id = ${assetId}
    ORDER BY date
  `
  return rows.map(mapValuationRow)
}

/**
 * POST /assets/{id}/valuations — 동일 날짜 upsert (API.md §9.7).
 * 사용자 행위(기본 source='manual')는 기존 auto/estimate/manual을 모두 덮어쓴다 —
 * 자동 스냅샷(snapshot_asset_valuations)이 manual만 보존하는 가드와 의도적 비대칭
 * (사용자 입력 > 자동값 우선순위).
 */
export async function createValuation(
  assetId: string,
  input: CreateValuationInput,
): Promise<ValuationDto> {
  const sql = getDb()
  const rows = await sql`
    INSERT INTO asset_valuations (asset_id, date, value, source, memo)
    VALUES (${assetId}, ${input.date}, ${input.value}, ${input.source},
            ${input.memo ?? null})
    ON CONFLICT (asset_id, date)
    DO UPDATE SET value = EXCLUDED.value, source = EXCLUDED.source,
                  memo = EXCLUDED.memo
    RETURNING id, date::text AS date, value, source, memo
  `
  return mapValuationRow(rows[0])
}
