import { reorderSchema } from "@/lib/validators"
import { guarded } from "@/server/api-guard"
import { jsonSuccess } from "@/server/api-response"
import { parseJsonBody } from "@/server/request"
import { reorderAccounts } from "@/server/services/account-service"

/** PATCH /api/v1/accounts/order — 정렬 일괄 저장, unnest 단일 UPDATE (API.md §3.6) */
export async function PATCH(request: Request): Promise<Response> {
  return guarded(async () => {
    const input = reorderSchema.parse(await parseJsonBody(request))
    return jsonSuccess(await reorderAccounts(input))
  })
}
