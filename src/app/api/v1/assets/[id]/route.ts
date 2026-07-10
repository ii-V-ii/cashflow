import { updateAssetSchema } from "@/lib/validators"
import { guarded } from "@/server/api-guard"
import { jsonSuccess } from "@/server/api-response"
import { parseJsonBody, type IdRouteContext } from "@/server/request"
import {
  deleteAsset,
  getAssetDetail,
  updateAsset,
} from "@/server/services/asset-service"

/** GET /api/v1/assets/{id} — 평가 이력·연결 계좌 포함 상세 (API.md §9.3) */
export async function GET(
  _request: Request,
  context: IdRouteContext,
): Promise<Response> {
  return guarded(async () => {
    const { id } = await context.params
    return jsonSuccess(await getAssetDetail(id))
  })
}

/** PATCH /api/v1/assets/{id} (API.md §9.4) */
export async function PATCH(
  request: Request,
  context: IdRouteContext,
): Promise<Response> {
  return guarded(async () => {
    const { id } = await context.params
    const input = updateAssetSchema.parse(await parseJsonBody(request))
    return jsonSuccess(await updateAsset(id, input))
  })
}

/** DELETE /api/v1/assets/{id} — 참조 시 409 REFERENCE_EXISTS (API.md §9.5) */
export async function DELETE(
  _request: Request,
  context: IdRouteContext,
): Promise<Response> {
  return guarded(
    async () => {
      const { id } = await context.params
      return jsonSuccess(await deleteAsset(id))
    },
    { fkMeansReference: true },
  )
}
