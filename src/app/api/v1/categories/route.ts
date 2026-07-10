import {
  createCategorySchema,
  listCategoriesQuerySchema,
} from "@/lib/validators"
import { guarded } from "@/server/api-guard"
import { jsonSuccess } from "@/server/api-response"
import { parseJsonBody, queryParams } from "@/server/request"
import {
  createCategory,
  listCategories,
} from "@/server/services/category-service"

/** GET /api/v1/categories (API.md §4.1) */
export async function GET(request: Request): Promise<Response> {
  return guarded(async () => {
    const query = listCategoriesQuerySchema.parse(queryParams(request))
    return jsonSuccess(await listCategories(query))
  })
}

/** POST /api/v1/categories (API.md §4.2) */
export async function POST(request: Request): Promise<Response> {
  return guarded(async () => {
    const input = createCategorySchema.parse(await parseJsonBody(request))
    return jsonSuccess(await createCategory(input), { status: 201 })
  })
}
