import { createAssetCategorySchema } from "@/lib/validators"
import { guarded } from "@/server/api-guard"
import { jsonSuccess } from "@/server/api-response"
import { parseJsonBody } from "@/server/request"
import {
  createAssetCategory,
  listAssetCategories,
} from "@/server/services/asset-category-service"

/** GET /api/v1/asset-categories (API.md §10.1) */
export async function GET(): Promise<Response> {
  return guarded(async () => jsonSuccess(await listAssetCategories()))
}

/** POST /api/v1/asset-categories (API.md §10.2) */
export async function POST(request: Request): Promise<Response> {
  return guarded(async () => {
    const input = createAssetCategorySchema.parse(await parseJsonBody(request))
    return jsonSuccess(await createAssetCategory(input), { status: 201 })
  })
}
