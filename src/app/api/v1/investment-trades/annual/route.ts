import { annualQuerySchema } from "@/lib/validators"
import { guarded } from "@/server/api-guard"
import { jsonSuccess } from "@/server/api-response"
import { queryParams } from "@/server/request"
import { getAnnualSummary } from "@/server/services/investment-trade-service"

/** GET /api/v1/investment-trades/annual — 연간 월별 요약 (API.md §11.8) */
export async function GET(request: Request): Promise<Response> {
  return guarded(async () => {
    const query = annualQuerySchema.parse(queryParams(request))
    return jsonSuccess(await getAnnualSummary(query))
  })
}
