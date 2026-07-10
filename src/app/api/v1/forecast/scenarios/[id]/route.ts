import { updateForecastScenarioSchema } from "@/lib/validators"
import { guarded } from "@/server/api-guard"
import { jsonSuccess } from "@/server/api-response"
import { parseJsonBody, type IdRouteContext } from "@/server/request"
import {
  deleteScenario,
  getScenario,
  updateScenario,
} from "@/server/services/forecast-service"

/** GET /api/v1/forecast/scenarios/{id} (API.md §13.3) */
export async function GET(
  _request: Request,
  context: IdRouteContext,
): Promise<Response> {
  return guarded(async () => {
    const { id } = await context.params
    return jsonSuccess(await getScenario(id))
  })
}

/** PATCH /api/v1/forecast/scenarios/{id} — 수정 시 기존 결과 무효 (API.md §13.4) */
export async function PATCH(
  request: Request,
  context: IdRouteContext,
): Promise<Response> {
  return guarded(async () => {
    const { id } = await context.params
    const input = updateForecastScenarioSchema.parse(await parseJsonBody(request))
    return jsonSuccess(await updateScenario(id, input))
  })
}

/** DELETE /api/v1/forecast/scenarios/{id} — 결과 CASCADE (API.md §13.5) */
export async function DELETE(
  _request: Request,
  context: IdRouteContext,
): Promise<Response> {
  return guarded(async () => {
    const { id } = await context.params
    return jsonSuccess(await deleteScenario(id))
  })
}
