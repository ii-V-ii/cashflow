import "server-only"

import type {
  CreateRecurringInput,
  UpdateRecurringInput,
} from "@/lib/validators"
import { ApiError } from "@/server/api-errors"
import { getDb } from "@/server/db/client"
import { callRpc } from "@/server/rpc"
import type { RecurringDto, RecurringProcessResultDto } from "@/types/api"

/** process_due_transactions RPC 원시 응답 (DB.md §3.7) */
interface ProcessDueRaw {
  applied: number
  generated: number
  deactivated: number
  generated_through: string
}

function toRpcPayload(
  input: CreateRecurringInput | UpdateRecurringInput,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  const assign = (key: string, value: unknown) => {
    if (value !== undefined) payload[key] = value
  }
  assign("type", input.type)
  assign("amount", input.amount)
  assign("description", input.description)
  assign("category_id", input.categoryId)
  assign("account_id", input.accountId)
  assign("to_account_id", input.toAccountId)
  assign("frequency", input.frequency)
  assign("interval", input.interval)
  assign("start_date", input.startDate)
  assign("end_date", input.endDate)
  if ("isActive" in input) {
    assign("is_active", input.isActive)
  }
  return payload
}

/** GET /recurring — recurring_json 목록 1왕복 (API.md §12.1) */
export async function listRecurring(): Promise<RecurringDto[]> {
  const sql = getDb()
  const rows = await sql`
    SELECT public.recurring_json(r.id) AS rec
    FROM recurring_transactions r
    ORDER BY r.is_active DESC, r.next_date ASC, r.created_at DESC
  `
  return rows.map((row) => row.rec as RecurringDto)
}

/**
 * POST /recurring — create_recurring RPC + DTO(jsonb) 단일 문장 1왕복 (API.md §12.2).
 * recurring_json은 VOLATILE — 같은 문장 안에서 RPC가 INSERT한 행을 본다.
 */
export async function createRecurring(
  input: CreateRecurringInput,
): Promise<RecurringDto> {
  const sql = getDb()
  const rows = await sql`
    SELECT public.recurring_json(
      public.create_recurring(${sql.json(toRpcPayload(input) as never)})
    ) AS rec
  `
  return rows[0].rec as RecurringDto
}

/** GET /recurring/{id} — recurring_json 1왕복 (API.md §12.3) */
export async function getRecurring(id: string): Promise<RecurringDto> {
  const sql = getDb()
  const rows = await sql`SELECT public.recurring_json(${id}::uuid) AS rec`
  const rec = rows[0]?.rec as RecurringDto | null
  if (!rec) {
    throw new ApiError(404, "NOT_FOUND", `정기 거래를 찾을 수 없습니다: ${id}`)
  }
  return rec
}

/** PATCH /recurring/{id} — update_recurring RPC + DTO 1왕복 (API.md §12.4) */
export async function updateRecurring(
  id: string,
  input: UpdateRecurringInput,
): Promise<RecurringDto> {
  const sql = getDb()
  const rows = await sql`
    SELECT public.recurring_json(
      public.update_recurring(${id}::uuid, ${sql.json(toRpcPayload(input) as never)})
    ) AS rec
  `
  return rows[0].rec as RecurringDto
}

/** DELETE /recurring/{id} — delete_recurring RPC 1왕복 (API.md §12.5) */
export async function deleteRecurring(id: string): Promise<{ id: string }> {
  const deleted = await callRpc<boolean>("delete_recurring", { p_id: id })
  if (!deleted) {
    throw new ApiError(404, "NOT_FOUND", `정기 거래를 찾을 수 없습니다: ${id}`)
  }
  return { id }
}

/**
 * POST /recurring/process — 온디맨드 실행 보정 (API.md §12.6, 멱등).
 * pg_cron과 동일한 process_due_transactions() 1왕복.
 */
export async function processRecurring(): Promise<RecurringProcessResultDto> {
  const raw = await callRpc<ProcessDueRaw>("process_due_transactions")
  return {
    processed: raw.applied,
    generatedThrough: raw.generated_through,
  }
}
