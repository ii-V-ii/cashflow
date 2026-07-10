import { reportTrendQuerySchema } from "@/lib/validators"
import { guarded } from "@/server/api-guard"
import { jsonSuccess } from "@/server/api-response"
import { queryParams } from "@/server/request"
import { getTrendReport } from "@/server/services/report-service"

/** 보고서는 읽기 전용 집계 — Cache-Control 부여 (API.md §14) */
const CACHE_CONTROL = "private, max-age=60"

/** GET /api/v1/reports/trend — 수입/지출 추이, 집계 SELECT 1왕복 (API.md §14.1) */
export async function GET(request: Request): Promise<Response> {
  return guarded(async () => {
    const query = reportTrendQuerySchema.parse(queryParams(request))
    return jsonSuccess(await getTrendReport(query), {
      headers: { "cache-control": CACHE_CONTROL },
    })
  })
}
