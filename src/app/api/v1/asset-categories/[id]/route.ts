import { updateAssetCategorySchema } from "@/lib/validators"
import { guarded } from "@/server/api-guard"
import { jsonSuccess } from "@/server/api-response"
import { parseJsonBody, type IdRouteContext } from "@/server/request"
import {
  deleteAssetCategory,
  updateAssetCategory,
} from "@/server/services/asset-category-service"

/** PATCH /api/v1/asset-categories/{id} (API.md §10.3) */
export async function PATCH(
  request: Request,
  context: IdRouteContext,
): Promise<Response> {
  return guarded(async () => {
    const { id } = await context.params
    const input = updateAssetCategorySchema.parse(await parseJsonBody(request))
    return jsonSuccess(await updateAssetCategory(id, input))
  })
}

/** DELETE /api/v1/asset-categories/{id} — 자산 참조 시 409 (API.md §10.4) */
export async function DELETE(
  _request: Request,
  context: IdRouteContext,
): Promise<Response> {
  return guarded(
    async () => {
      const { id } = await context.params
      return jsonSuccess(await deleteAssetCategory(id))
    },
    { fkMeansReference: true },
  )
}
