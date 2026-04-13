import { NextRequest } from 'next/server'
import {
  createBudgetService,
  getBudgetsService,
} from '@/lib/services/budget-service'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const yearParam = searchParams.get('year')
  const year = yearParam ? Number(yearParam) : undefined

  const result = await getBudgetsService(year)
  return Response.json(result)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const result = await createBudgetService(body)

  if (!result.success) {
    const status = result.error.code === 'DUPLICATE' ? 409 : 400
    return Response.json(result, { status })
  }

  return Response.json(result, { status: 201 })
}
