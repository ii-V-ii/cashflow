import { tradeRangeQuerySchema } from "@/lib/validators"
import { guarded } from "@/server/api-guard"
import { jsonSuccess } from "@/server/api-response"
import { queryParams } from "@/server/request"
import { getTickerBreakdown } from "@/server/services/investment-trade-service"

/** GET /api/v1/investment-trades/tickers — 종목별 보유/매도완료 (API.md §11.7) */
export async function GET(request: Request): Promise<Response> {
  return guarded(async () => {
    const query = tradeRangeQuerySchema.parse(queryParams(request))
    return jsonSuccess(await getTickerBreakdown(query))
  })
}
