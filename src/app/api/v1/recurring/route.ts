import { createRecurringSchema } from "@/lib/validators"
import { guarded } from "@/server/api-guard"
import { jsonSuccess } from "@/server/api-response"
import { parseJsonBody } from "@/server/request"
import {
  createRecurring,
  listRecurring,
} from "@/server/services/recurring-service"

/** GET /api/v1/recurring — 정기 거래 목록 (API.md §12.1) */
export async function GET(): Promise<Response> {
  return guarded(async () => jsonSuccess(await listRecurring()))
}

/** POST /api/v1/recurring — 정기 거래 생성 + 12개월 pending (API.md §12.2) */
export async function POST(request: Request): Promise<Response> {
  return guarded(async () => {
    const input = createRecurringSchema.parse(await parseJsonBody(request))
    return jsonSuccess(await createRecurring(input), { status: 201 })
  })
}
