import { NextRequest } from 'next/server'
import {
  getTransactionByIdService,
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

export async function DELETE(_request: NextRequest, { params }: Context) {
  const { id } = await params
  const result = await deleteTransactionService(id)

  if (!result.success) {
    return Response.json(result, { status: 404 })
  }

  return Response.json(result)
}
