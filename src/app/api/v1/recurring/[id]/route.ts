import { updateRecurringSchema } from "@/lib/validators"
import { guarded } from "@/server/api-guard"
import { jsonSuccess } from "@/server/api-response"
import { parseJsonBody, type IdRouteContext } from "@/server/request"
import {
  deleteRecurring,
  getRecurring,
  updateRecurring,
} from "@/server/services/recurring-service"

/** GET /api/v1/recurring/{id} (API.md §12.3) */
export async function GET(
  _request: Request,
  context: IdRouteContext,
): Promise<Response> {
  return guarded(async () => {
    const { id } = await context.params
    return jsonSuccess(await getRecurring(id))
  })
}

/** PATCH /api/v1/recurring/{id} — 수정 + 미래 pending 재생성 (API.md §12.4) */
export async function PATCH(
  request: Request,
  context: IdRouteContext,
): Promise<Response> {
  return guarded(async () => {
    const { id } = await context.params
    const input = updateRecurringSchema.parse(await parseJsonBody(request))
    return jsonSuccess(await updateRecurring(id, input))
  })
}

/** DELETE /api/v1/recurring/{id} — 미래 pending 삭제, applied 보존 (API.md §12.5) */
export async function DELETE(
  _request: Request,
  context: IdRouteContext,
): Promise<Response> {
  return guarded(async () => {
    const { id } = await context.params
    return jsonSuccess(await deleteRecurring(id))
  })
}
