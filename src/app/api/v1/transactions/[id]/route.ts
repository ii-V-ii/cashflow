import { updateTransactionSchema } from "@/lib/validators"
import { guarded } from "@/server/api-guard"
import { jsonSuccess } from "@/server/api-response"
import { parseJsonBody, type IdRouteContext } from "@/server/request"
import {
  deleteTransaction,
  getTransaction,
  updateTransaction,
} from "@/server/services/transaction-service"

/** GET /api/v1/transactions/{id} (API.md §2.3) */
export async function GET(_request: Request, context: IdRouteContext): Promise<Response> {
  return guarded(async () => {
    const { id } = await context.params
    return jsonSuccess(await getTransaction(id))
  })
}

/** PATCH /api/v1/transactions/{id} (API.md §2.4) */
export async function PATCH(request: Request, context: IdRouteContext): Promise<Response> {
  return guarded(async () => {
    const { id } = await context.params
    const input = updateTransactionSchema.parse(await parseJsonBody(request))
    return jsonSuccess(await updateTransaction(id, input))
  })
}

/** DELETE /api/v1/transactions/{id} (API.md §2.5) */
export async function DELETE(_request: Request, context: IdRouteContext): Promise<Response> {
  return guarded(async () => {
    const { id } = await context.params
    return jsonSuccess(await deleteTransaction(id))
  })
}
