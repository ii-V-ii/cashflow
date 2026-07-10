import {
  createTransactionSchema,
  listTransactionsQuerySchema,
} from "@/lib/validators"
import { guarded } from "@/server/api-guard"
import { jsonSuccess } from "@/server/api-response"
import { parseJsonBody, queryParams } from "@/server/request"
import {
  createTransaction,
  listTransactions,
} from "@/server/services/transaction-service"

/** GET /api/v1/transactions — 거래 목록 (API.md §2.1) */
export async function GET(request: Request): Promise<Response> {
  return guarded(async () => {
    const query = listTransactionsQuerySchema.parse(queryParams(request))
    return jsonSuccess(await listTransactions(query))
  })
}

/** POST /api/v1/transactions — 거래 생성 (API.md §2.2) */
export async function POST(request: Request): Promise<Response> {
  return guarded(async () => {
    const input = createTransactionSchema.parse(await parseJsonBody(request))
    return jsonSuccess(await createTransaction(input), { status: 201 })
  })
}
