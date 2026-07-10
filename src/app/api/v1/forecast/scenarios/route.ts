import { createForecastScenarioSchema } from "@/lib/validators"
import { guarded } from "@/server/api-guard"
import { jsonSuccess } from "@/server/api-response"
import { parseJsonBody } from "@/server/request"
import { createScenario, listScenarios } from "@/server/services/forecast-service"

/** GET /api/v1/forecast/scenarios — 시나리오 목록 (API.md §13.1) */
export async function GET(): Promise<Response> {
  return guarded(async () => jsonSuccess(await listScenarios()))
}

/** POST /api/v1/forecast/scenarios — 생성 (API.md §13.2) */
export async function POST(request: Request): Promise<Response> {
  return guarded(async () => {
    const input = createForecastScenarioSchema.parse(await parseJsonBody(request))
    return jsonSuccess(await createScenario(input), { status: 201 })
  })
}
