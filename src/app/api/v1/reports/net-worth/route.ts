import { reportNetWorthQuerySchema } from "@/lib/validators"
import { guarded } from "@/server/api-guard"
import { jsonSuccess } from "@/server/api-response"
import { queryParams } from "@/server/request"
import { getNetWorthReport } from "@/server/services/report-service"

/** 보고서는 읽기 전용 집계 — Cache-Control 부여 (API.md §14) */
const CACHE_CONTROL = "private, max-age=60"

/** GET /api/v1/reports/net-worth — 순자산 추이, 1왕복 (API.md §14.3) */
export async function GET(request: Request): Promise<Response> {
  return guarded(async () => {
    const query = reportNetWorthQuerySchema.parse(queryParams(request))
    return jsonSuccess(await getNetWorthReport(query), {
      headers: { "cache-control": CACHE_CONTROL },
    })
  })
}
