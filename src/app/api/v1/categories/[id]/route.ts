import { updateCategorySchema } from "@/lib/validators"
import { guarded } from "@/server/api-guard"
import { jsonSuccess } from "@/server/api-response"
import { parseJsonBody, type IdRouteContext } from "@/server/request"
import {
  deleteCategory,
  updateCategory,
} from "@/server/services/category-service"

/** PATCH /api/v1/categories/{id} (API.md §4.3) */
export async function PATCH(request: Request, context: IdRouteContext): Promise<Response> {
  return guarded(async () => {
    const { id } = await context.params
    const input = updateCategorySchema.parse(await parseJsonBody(request))
    return jsonSuccess(await updateCategory(id, input))
  })
}

/** DELETE /api/v1/categories/{id} — 거래 참조 시 409 (API.md §4.4) */
export async function DELETE(_request: Request, context: IdRouteContext): Promise<Response> {
  return guarded(
    async () => {
      const { id } = await context.params
      return jsonSuccess(await deleteCategory(id))
    },
    { fkMeansReference: true },
  )
}
