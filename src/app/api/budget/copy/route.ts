import { NextRequest } from 'next/server'
import { copyBudgetFromPreviousMonthService } from '@/lib/services/budget-service'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const result = await copyBudgetFromPreviousMonthService(body)

  if (!result.success) {
    const statusMap: Record<string, number> = {
      NOT_FOUND: 404,
      DUPLICATE: 409,
      VALIDATION_ERROR: 400,
    }
    const status = statusMap[result.error.code] ?? 400
    return Response.json(result, { status })
  }

  return Response.json(result, { status: 201 })
}
