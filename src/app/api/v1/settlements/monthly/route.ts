import { settlementMonthlyQuerySchema } from "@/lib/validators"
import { guarded } from "@/server/api-guard"
import { jsonSuccess } from "@/server/api-response"
import { queryParams } from "@/server/request"
import { getMonthlySettlement } from "@/server/services/settlement-service"

/** 결산은 저장하지 않는 파생 집계 — 짧은 사설 캐시로 반복 조회 완화 (API.md §7) */
const CACHE_CONTROL = "private, max-age=60"

/** GET /api/v1/settlements/monthly — 월 결산, get_monthly_settlement RPC 1왕복 (API.md §7.1) */
export async function GET(request: Request): Promise<Response> {
  return guarded(async () => {
    const query = settlementMonthlyQuerySchema.parse(queryParams(request))
    return jsonSuccess(await getMonthlySettlement(query), {
      headers: { "cache-control": CACHE_CONTROL },
    })
  })
}
