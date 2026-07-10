import { guarded } from "@/server/api-guard"
import { jsonSuccess } from "@/server/api-response"
import { processRecurring } from "@/server/services/recurring-service"

/**
 * POST /api/v1/recurring/process — 온디맨드 실행 보정 (API.md §12.6).
 * pg_cron 배치와 동일한 process_due_transactions() 호출 — 멱등이라 중복 호출 무해.
 */
export async function POST(): Promise<Response> {
  return guarded(async () => jsonSuccess(await processRecurring()))
}
