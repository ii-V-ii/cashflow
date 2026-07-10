import { budgetsListQuerySchema, createBudgetSchema } from "@/lib/validators"
import { guarded } from "@/server/api-guard"
import { jsonSuccess } from "@/server/api-response"
import { parseJsonBody, queryParams } from "@/server/request"
import { createBudget, listBudgets } from "@/server/services/budget-service"

/** GET /api/v1/budgets — 연도별 예산 목록 (API.md §6.1) */
export async function GET(request: Request): Promise<Response> {
  return guarded(async () => {
    const query = budgetsListQuerySchema.parse(queryParams(request))
    return jsonSuccess(await listBudgets(query))
  })
}

/** POST /api/v1/budgets — 예산 생성 (items 포함, API.md §6.2) */
export async function POST(request: Request): Promise<Response> {
  return guarded(async () => {
    const input = createBudgetSchema.parse(await parseJsonBody(request))
    return jsonSuccess(await createBudget(input), { status: 201 })
  })
}
