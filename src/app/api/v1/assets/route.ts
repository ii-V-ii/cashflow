import { createAssetSchema, listAssetsQuerySchema } from "@/lib/validators"
import { guarded } from "@/server/api-guard"
import { jsonSuccess } from "@/server/api-response"
import { parseJsonBody, queryParams } from "@/server/request"
import { createAsset, listAssets } from "@/server/services/asset-service"

/** GET /api/v1/assets — 현재가치 포함 목록 (API.md §9.1) */
export async function GET(request: Request): Promise<Response> {
  return guarded(async () => {
    const query = listAssetsQuerySchema.parse(queryParams(request))
    return jsonSuccess(await listAssets(query))
  })
}

/** POST /api/v1/assets (API.md §9.2) */
export async function POST(request: Request): Promise<Response> {
  return guarded(async () => {
    const input = createAssetSchema.parse(await parseJsonBody(request))
    return jsonSuccess(await createAsset(input), { status: 201 })
  })
}
