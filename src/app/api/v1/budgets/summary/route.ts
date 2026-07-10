import { budgetSummaryQuerySchema } from "@/lib/validators"
import { guarded } from "@/server/api-guard"
import { jsonSuccess } from "@/server/api-response"
import { queryParams } from "@/server/request"
import { getBudgetSummary } from "@/server/services/budget-service"

/** 개요 차트는 거래 입력 빈도 대비 조회가 잦다 — 짧은 프라이빗 캐시 (API.md §6.10) */
const CACHE_CONTROL = "private, max-age=30"

/** GET /api/v1/budgets/summary — 연간 개요 (API.md §6.10) */
export async function GET(request: Request): Promise<Response> {
  return guarded(async () => {
    const query = budgetSummaryQuerySchema.parse(queryParams(request))
    return jsonSuccess(await getBudgetSummary(query), {
      headers: { "cache-control": CACHE_CONTROL },
    })
  })
}
