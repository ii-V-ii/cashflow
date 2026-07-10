import { updateAnnualGridCellSchema } from "@/lib/validators"
import { guarded } from "@/server/api-guard"
import { jsonSuccess } from "@/server/api-response"
import { parseJsonBody } from "@/server/request"
import { upsertAnnualGridCell } from "@/server/services/budget-service"

/** PUT /api/v1/budgets/annual-grid/cell — 그리드 셀 upsert, amount 0 = 삭제 (API.md §6.9) */
export async function PUT(request: Request): Promise<Response> {
  return guarded(async () => {
    const input = updateAnnualGridCellSchema.parse(await parseJsonBody(request))
    return jsonSuccess(await upsertAnnualGridCell(input))
  })
}
