import { annualGridQuerySchema } from "@/lib/validators"
import { guarded } from "@/server/api-guard"
import { jsonSuccess } from "@/server/api-response"
import { queryParams } from "@/server/request"
import { getAnnualGrid } from "@/server/services/budget-service"

/** 그리드는 셀 편집 직후 무효화되므로 짧은 프라이빗 캐시만 부여 (API.md §6.8) */
const CACHE_CONTROL = "private, max-age=30"

/** GET /api/v1/budgets/annual-grid — 12개월 × 카테고리 (API.md §6.8) */
export async function GET(request: Request): Promise<Response> {
  return guarded(async () => {
    const query = annualGridQuerySchema.parse(queryParams(request))
    return jsonSuccess(await getAnnualGrid(query), {
      headers: { "cache-control": CACHE_CONTROL },
    })
  })
}
