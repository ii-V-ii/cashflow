import { updateBudgetSchema } from "@/lib/validators"
import { guarded } from "@/server/api-guard"
import { jsonSuccess } from "@/server/api-response"
import { parseJsonBody, type IdRouteContext } from "@/server/request"
import {
  deleteBudget,
  getBudget,
  updateBudget,
} from "@/server/services/budget-service"

/** GET /api/v1/budgets/{id} — 상세(계획 + 실적) (API.md §6.3) */
export async function GET(_request: Request, context: IdRouteContext): Promise<Response> {
  return guarded(async () => {
    const { id } = await context.params
    return jsonSuccess(await getBudget(id))
  })
}

/** PATCH /api/v1/budgets/{id} — items 전달 시 전량 교체 (API.md §6.4) */
export async function PATCH(request: Request, context: IdRouteContext): Promise<Response> {
  return guarded(async () => {
    const { id } = await context.params
    const input = updateBudgetSchema.parse(await parseJsonBody(request))
    return jsonSuccess(await updateBudget(id, input))
  })
}

/** DELETE /api/v1/budgets/{id} — items CASCADE (API.md §6.5) */
export async function DELETE(_request: Request, context: IdRouteContext): Promise<Response> {
  return guarded(async () => {
    const { id } = await context.params
    return jsonSuccess(await deleteBudget(id))
  })
}
