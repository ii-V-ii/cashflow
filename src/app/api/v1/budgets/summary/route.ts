import { budgetSummaryQuerySchema } from "@/lib/validators"
import { guarded } from "@/server/api-guard"
import { jsonSuccess } from "@/server/api-response"
import { queryParams } from "@/server/request"
import { getBudgetSummary } from "@/server/services/budget-service"

/**
 * 개요 차트도 거래·예산 변경 시 무효화 재조회 대상 — max-age 브라우저 캐시가
 * 재요청을 가로채지 않도록 no-cache(매번 재검증) (API.md §6.10).
 */
const CACHE_CONTROL = "private, no-cache"

/** GET /api/v1/budgets/summary — 연간 개요 (API.md §6.10) */
export async function GET(request: Request): Promise<Response> {
  return guarded(async () => {
    const query = budgetSummaryQuerySchema.parse(queryParams(request))
    return jsonSuccess(await getBudgetSummary(query), {
      headers: { "cache-control": CACHE_CONTROL },
    })
  })
}
