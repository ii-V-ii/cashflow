import { NextRequest } from 'next/server'
import {
  getBudgetWithActualsService,
  updateBudgetService,
  deleteBudgetService,
} from '@/lib/services/budget-service'

type Context = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Context) {
  const { id } = await params
  const result = await getBudgetWithActualsService(id)

  if (!result.success) {
    return Response.json(result, { status: 404 })
  }

  return Response.json(result)
}

export async function PUT(request: NextRequest, { params }: Context) {
  const { id } = await params
  const body = await request.json()
  const result = await updateBudgetService(id, body)

  if (!result.success) {
    const status = result.error.code === 'NOT_FOUND' ? 404 : 400
    return Response.json(result, { status })
  }

  return Response.json(result)
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  const { id } = await params
  const result = await deleteBudgetService(id)

  if (!result.success) {
    return Response.json(result, { status: 404 })
  }

  return Response.json(result)
}
