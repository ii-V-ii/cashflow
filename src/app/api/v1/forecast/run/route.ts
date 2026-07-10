import { runForecastSchema } from "@/lib/validators"
import { guarded } from "@/server/api-guard"
import { jsonSuccess } from "@/server/api-response"
import { parseJsonBody } from "@/server/request"
import { runForecast } from "@/server/services/forecast-service"

/** POST /api/v1/forecast/run — 예측 실행 + 결과 스냅샷 저장 (API.md §13.6) */
export async function POST(request: Request): Promise<Response> {
  return guarded(async () => {
    const input = runForecastSchema.parse(await parseJsonBody(request))
    return jsonSuccess(await runForecast(input.scenarioId))
  })
}
