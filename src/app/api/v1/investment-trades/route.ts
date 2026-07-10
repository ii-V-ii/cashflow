import { createInvestmentTradeSchema, listTradesQuerySchema } from "@/lib/validators"
import { guarded } from "@/server/api-guard"
import { jsonSuccess } from "@/server/api-response"
import { parseJsonBody, queryParams } from "@/server/request"
import { createTrade, listTrades } from "@/server/services/investment-trade-service"

/** GET /api/v1/investment-trades (API.md §11.1) */
export async function GET(request: Request): Promise<Response> {
  return guarded(async () => {
    const query = listTradesQuerySchema.parse(queryParams(request))
    return jsonSuccess(await listTrades(query))
  })
}

/** POST /api/v1/investment-trades — FIFO RPC 1왕복 (API.md §11.2) */
export async function POST(request: Request): Promise<Response> {
  return guarded(async () => {
    const input = createInvestmentTradeSchema.parse(await parseJsonBody(request))
    return jsonSuccess(await createTrade(input), { status: 201 })
  })
}
