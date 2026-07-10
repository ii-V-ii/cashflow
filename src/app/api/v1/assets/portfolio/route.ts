import { guarded } from "@/server/api-guard"
import { jsonSuccess } from "@/server/api-response"
import { getPortfolio } from "@/server/services/asset-service"

/** GET /api/v1/assets/portfolio — 카테고리별 도넛 데이터 (API.md §9.6) */
export async function GET(): Promise<Response> {
  return guarded(async () => jsonSuccess(await getPortfolio()))
}
