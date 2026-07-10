import { createAccountSchema } from "@/lib/validators"
import { guarded } from "@/server/api-guard"
import { jsonSuccess } from "@/server/api-response"
import { parseJsonBody } from "@/server/request"
import { createAccount, listAccounts } from "@/server/services/account-service"

/** GET /api/v1/accounts — 잔액 포함 목록 (API.md §3.1) */
export async function GET(): Promise<Response> {
  return guarded(async () => jsonSuccess(await listAccounts()))
}

/** POST /api/v1/accounts (API.md §3.2) */
export async function POST(request: Request): Promise<Response> {
  return guarded(async () => {
    const input = createAccountSchema.parse(await parseJsonBody(request))
    return jsonSuccess(await createAccount(input), { status: 201 })
  })
}
