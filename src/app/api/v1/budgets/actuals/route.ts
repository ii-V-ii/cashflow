import { budgetActualsQuerySchema } from "@/lib/validators"
import { guarded } from "@/server/api-guard"
import { jsonSuccess } from "@/server/api-response"
import { queryParams } from "@/server/request"
import { getBudgetActuals } from "@/server/services/budget-service"

/** GET /api/v1/budgets/actuals — 월 예산 대비 실적 (API.md §6.7) */
export async function GET(request: Request): Promise<Response> {
  return guarded(async () => {
    const query = budgetActualsQuerySchema.parse(queryParams(request))
    return jsonSuccess(await getBudgetActuals(query))
  })
}
