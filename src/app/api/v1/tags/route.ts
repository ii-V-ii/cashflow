import { listTagsQuerySchema } from "@/lib/validators"
import { guarded } from "@/server/api-guard"
import { jsonSuccess } from "@/server/api-response"
import { queryParams } from "@/server/request"
import { listTags } from "@/server/services/tag-service"

/** GET /api/v1/tags — 태그 목록/자동완성 (API.md §5.1) */
export async function GET(request: Request): Promise<Response> {
  return guarded(async () => {
    const query = listTagsQuerySchema.parse(queryParams(request))
    return jsonSuccess(await listTags(query))
  })
}
