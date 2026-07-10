import "server-only"

import type { ListTagsQuery } from "@/lib/validators"
import { getDb } from "@/server/db/client"
import type { TagDto } from "@/types/api"

const SEARCH_LIMIT = 20
const RECENT_LIMIT = 100

/**
 * GET /tags — 자동완성 검색 (API.md §5.1).
 * q 있으면 이름순 최대 20건, 없으면 최근 생성순 최대 100건.
 * 태그 생성/연결은 거래 RPC 내부에서만 — 쓰기 API 없음.
 */
export async function listTags(query: ListTagsQuery): Promise<TagDto[]> {
  const sql = getDb()

  const rows = query.q
    ? await sql`
        SELECT id, name, color FROM tags
        WHERE name ILIKE ${`%${query.q}%`}
        ORDER BY name
        LIMIT ${SEARCH_LIMIT}
      `
    : await sql`
        SELECT id, name, color FROM tags
        ORDER BY created_at DESC
        LIMIT ${RECENT_LIMIT}
      `

  return rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    color: (row.color as string | null) ?? null,
  }))
}
