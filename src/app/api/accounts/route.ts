import { NextRequest } from 'next/server'
import { findAllAccounts, createAccount } from '@/db/repositories'
import { createAccountSchema } from '@/lib/validators'
import { successResponse, errorResponse } from '@/lib/api-response'

export async function GET() {
  const accounts = await findAllAccounts()
  return Response.json(successResponse(accounts))
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const parsed = createAccountSchema.safeParse(body)

  if (!parsed.success) {
    return Response.json(
      errorResponse('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다'),
      { status: 400 },
    )
  }

  const account = await createAccount(parsed.data)
  return Response.json(successResponse(account), { status: 201 })
}
