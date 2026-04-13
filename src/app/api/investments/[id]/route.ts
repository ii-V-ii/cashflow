import { NextRequest } from 'next/server'
import {
  getInvestmentReturnByIdService,
  updateInvestmentReturnService,
  deleteInvestmentReturnService,
} from '@/lib/services/investment-service'

type Context = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Context) {
  const { id } = await params
  const result = await getInvestmentReturnByIdService(id)
  const status = result.success ? 200 : 404
  return Response.json(result, { status })
}

export async function PUT(request: NextRequest, { params }: Context) {
  const { id } = await params
  const body = await request.json()
  const result = await updateInvestmentReturnService(id, body)
  const status = result.success ? 200 : 'error' in result && result.error.code === 'NOT_FOUND' ? 404 : 400
  return Response.json(result, { status })
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  const { id } = await params
  const result = await deleteInvestmentReturnService(id)
  const status = result.success ? 200 : 404
  return Response.json(result, { status })
}
