import { forecastResultsQuerySchema } from "@/lib/validators"
import { guarded } from "@/server/api-guard"
import { jsonSuccess } from "@/server/api-response"
import { queryParams } from "@/server/request"
import { listResults } from "@/server/services/forecast-service"

/** GET /api/v1/forecast/results?scenarioId= — 저장된 결과 (API.md §13.7) */
export async function GET(request: Request): Promise<Response> {
  return guarded(async () => {
    const query = forecastResultsQuerySchema.parse(queryParams(request))
    return jsonSuccess(await listResults(query.scenarioId))
  })
}
