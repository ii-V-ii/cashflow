import { tradeRangeQuerySchema } from "@/lib/validators"
import { guarded } from "@/server/api-guard"
import { jsonSuccess } from "@/server/api-response"
import { queryParams } from "@/server/request"
import { getSummary } from "@/server/services/investment-trade-service"

/** GET /api/v1/investment-trades/summary — 수익 요약 (API.md §11.6) */
export async function GET(request: Request): Promise<Response> {
  return guarded(async () => {
    const query = tradeRangeQuerySchema.parse(queryParams(request))
    return jsonSuccess(await getSummary(query))
  })
}
