import { updateAccountSchema } from "@/lib/validators"
import { guarded } from "@/server/api-guard"
import { jsonSuccess } from "@/server/api-response"
import { parseJsonBody, type IdRouteContext } from "@/server/request"
import {
  deleteAccount,
  getAccount,
  updateAccount,
} from "@/server/services/account-service"

/** GET /api/v1/accounts/{id} (API.md §3.3) */
export async function GET(_request: Request, context: IdRouteContext): Promise<Response> {
  return guarded(async () => {
    const { id } = await context.params
    return jsonSuccess(await getAccount(id))
  })
}

/** PATCH /api/v1/accounts/{id} (API.md §3.4) */
export async function PATCH(request: Request, context: IdRouteContext): Promise<Response> {
  return guarded(async () => {
    const { id } = await context.params
    const input = updateAccountSchema.parse(await parseJsonBody(request))
    return jsonSuccess(await updateAccount(id, input))
  })
}

/** DELETE /api/v1/accounts/{id} — 참조 시 409 REFERENCE_EXISTS (API.md §3.5) */
export async function DELETE(_request: Request, context: IdRouteContext): Promise<Response> {
  return guarded(
    async () => {
      const { id } = await context.params
      return jsonSuccess(await deleteAccount(id))
    },
    { fkMeansReference: true },
  )
}
