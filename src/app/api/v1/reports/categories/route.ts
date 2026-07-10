import { reportCategoriesQuerySchema } from "@/lib/validators"
import { guarded } from "@/server/api-guard"
import { jsonSuccess } from "@/server/api-response"
import { queryParams } from "@/server/request"
import { getCategoryReport } from "@/server/services/report-service"

/** 보고서는 읽기 전용 집계 — Cache-Control 부여 (API.md §14) */
const CACHE_CONTROL = "private, max-age=60"

/** GET /api/v1/reports/categories — 카테고리별 지출 도넛(대분류 롤업), 1왕복 (API.md §14.2) */
export async function GET(request: Request): Promise<Response> {
  return guarded(async () => {
    const query = reportCategoriesQuerySchema.parse(queryParams(request))
    return jsonSuccess(await getCategoryReport(query), {
      headers: { "cache-control": CACHE_CONTROL },
    })
  })
}
