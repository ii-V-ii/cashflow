import { NextRequest } from 'next/server'
import {
  getRecurringTransactionByIdService,
  updateRecurringTransactionService,
  deleteRecurringTransactionService,
} from '@/lib/services/recurring-service'

type Context = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Context) {
  const { id } = await params
  const result = await getRecurringTransactionByIdService(id)
  const status = result.success ? 200 : 404
  return Response.json(result, { status })
}

export async function PUT(request: NextRequest, { params }: Context) {
  const { id } = await params
  const body = await request.json()
  const result = await updateRecurringTransactionService(id, body)
  const status = result.success
    ? 200
    : 'error' in result && result.error.code === 'NOT_FOUND'
      ? 404
      : 400
  return Response.json(result, { status })
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  const { id } = await params
  const result = await deleteRecurringTransactionService(id)
  const status = result.success ? 200 : 404
  return Response.json(result, { status })
}
