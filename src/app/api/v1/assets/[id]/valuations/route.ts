import { createValuationSchema } from "@/lib/validators"
import { guarded } from "@/server/api-guard"
import { jsonSuccess } from "@/server/api-response"
import { parseJsonBody, type IdRouteContext } from "@/server/request"
import { createValuation, listValuations } from "@/server/services/asset-service"

/** GET /api/v1/assets/{id}/valuations — 날짜 오름차순 (API.md §9.7) */
export async function GET(
  _request: Request,
  context: IdRouteContext,
): Promise<Response> {
  return guarded(async () => {
    const { id } = await context.params
    return jsonSuccess(await listValuations(id))
  })
}

/** POST /api/v1/assets/{id}/valuations — 동일 날짜 upsert (API.md §9.7) */
export async function POST(
  request: Request,
  context: IdRouteContext,
): Promise<Response> {
  return guarded(async () => {
    const { id } = await context.params
    const input = createValuationSchema.parse(await parseJsonBody(request))
    return jsonSuccess(await createValuation(id, input), { status: 201 })
  })
}
