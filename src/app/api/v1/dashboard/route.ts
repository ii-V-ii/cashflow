import { dashboardQuerySchema } from "@/lib/validators"
import { guarded } from "@/server/api-guard"
import { jsonSuccess } from "@/server/api-response"
import { queryParams } from "@/server/request"
import { getDashboard } from "@/server/services/dashboard-service"

/** GET /api/v1/dashboard — 대시보드 전체, get_dashboard RPC 1왕복 (API.md §8.1) */
export async function GET(request: Request): Promise<Response> {
  return guarded(async () => {
    const query = dashboardQuerySchema.parse(queryParams(request))
    return jsonSuccess(await getDashboard(query))
  })
}
