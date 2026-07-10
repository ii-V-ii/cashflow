import { annualGridQuerySchema } from "@/lib/validators"
import { guarded } from "@/server/api-guard"
import { jsonSuccess } from "@/server/api-response"
import { queryParams } from "@/server/request"
import { getAnnualGrid } from "@/server/services/budget-service"

/**
 * 그리드는 셀 편집 직후 클라이언트가 재조회한다 — max-age를 주면 브라우저 HTTP 캐시가
 * TanStack 무효화 재요청에 이전 응답을 돌려주므로 no-cache(매번 재검증)로 고정 (API.md §6.8).
 */
const CACHE_CONTROL = "private, no-cache"

/** GET /api/v1/budgets/annual-grid — 12개월 × 카테고리 (API.md §6.8) */
export async function GET(request: Request): Promise<Response> {
  return guarded(async () => {
    const query = annualGridQuerySchema.parse(queryParams(request))
    return jsonSuccess(await getAnnualGrid(query), {
      headers: { "cache-control": CACHE_CONTROL },
    })
  })
}
