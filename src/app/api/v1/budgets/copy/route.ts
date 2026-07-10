import { copyBudgetSchema } from "@/lib/validators"
import { guarded } from "@/server/api-guard"
import { jsonSuccess } from "@/server/api-response"
import { parseJsonBody } from "@/server/request"
import { copyBudget } from "@/server/services/budget-service"

/** POST /api/v1/budgets/copy — 전월 예산 복사 (API.md §6.6) */
export async function POST(request: Request): Promise<Response> {
  return guarded(async () => {
    const input = copyBudgetSchema.parse(await parseJsonBody(request))
    return jsonSuccess(await copyBudget(input), { status: 201 })
  })
}
