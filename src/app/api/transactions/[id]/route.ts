import { NextRequest } from 'next/server'
import {
  getTransactionByIdService,
  updateTransactionService,
  deleteTransactionService,
} from '@/lib/services/transaction-service'

type Context = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Context) {
  const { id } = await params
  const result = await getTransactionByIdService(id)

  if (!result.success) {
    return Response.json(result, { status: 404 })
  }

  return Response.json(result)
}

export async function PUT(request: NextRequest, { params }: Context) {
  const { id } = await params
  const body = await request.json()
  const result = await updateTransactionService(id, body)

  if (!result.success) {
    const status = result.error.code === 'VALIDATION_ERROR' ? 400 : 404
    return Response.json(result, { status })
  }

  return Response.json(result)
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  const { id } = await params
  const result = await deleteTransactionService(id)

  if (!result.success) {
    return Response.json(result, { status: 404 })
  }

  return Response.json(result)
}
