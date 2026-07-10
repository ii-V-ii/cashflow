import { reorderSchema } from "@/lib/validators"
import { guarded } from "@/server/api-guard"
import { jsonSuccess } from "@/server/api-response"
import { parseJsonBody } from "@/server/request"
import { reorderCategories } from "@/server/services/category-service"

/** PATCH /api/v1/categories/order (API.md §4.5) */
export async function PATCH(request: Request): Promise<Response> {
  return guarded(async () => {
    const input = reorderSchema.parse(await parseJsonBody(request))
    return jsonSuccess(await reorderCategories(input))
  })
}
