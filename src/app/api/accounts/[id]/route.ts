import { NextRequest } from 'next/server'
import { findAccountById, updateAccount, deleteAccount } from '@/db/repositories'
import { updateAccountSchema } from '@/lib/validators'
import { successResponse, errorResponse } from '@/lib/api-response'

type Context = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Context) {
  const { id } = await params
  const account = await findAccountById(id)

  if (!account) {
    return Response.json(errorResponse('NOT_FOUND', '계좌를 찾을 수 없습니다'), { status: 404 })
  }

  return Response.json(successResponse(account))
}

export async function PUT(request: NextRequest, { params }: Context) {
  const { id } = await params
  const body = await request.json()
  const parsed = updateAccountSchema.safeParse(body)

  if (!parsed.success) {
    return Response.json(
      errorResponse('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다'),
      { status: 400 },
    )
  }

  const account = await updateAccount(id, parsed.data)
  if (!account) {
    return Response.json(errorResponse('NOT_FOUND', '계좌를 찾을 수 없습니다'), { status: 404 })
  }

  return Response.json(successResponse(account))
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  const { id } = await params

  try {
    const deleted = await deleteAccount(id)

    if (!deleted) {
      return Response.json(errorResponse('NOT_FOUND', '계좌를 찾을 수 없습니다'), { status: 404 })
    }

    return Response.json(successResponse({ deleted: true }))
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    if (message.includes('foreign key') || message.includes('violates')) {
      return Response.json(
        errorResponse('FK_CONSTRAINT', '이 계좌에 연결된 거래 또는 정기거래가 있어 삭제할 수 없습니다. 먼저 관련 거래를 삭제해주세요.'),
        { status: 409 },
      )
    }
    return Response.json(
      errorResponse('SERVER_ERROR', '계좌 삭제 중 오류가 발생했습니다.'),
      { status: 500 },
    )
  }
}
