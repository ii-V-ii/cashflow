import { NextRequest } from 'next/server'
import { getAnnualBudgetSummaryService } from '@/lib/services/budget-service'
import { errorResponse } from '@/lib/api-response'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const yearParam = searchParams.get('year')

  if (!yearParam) {
    return Response.json(
      errorResponse('VALIDATION_ERROR', 'year 파라미터가 필요합니다'),
      { status: 400 },
    )
  }

  const year = Number(yearParam)
  if (isNaN(year) || year < 2000 || year > 2100) {
    return Response.json(
      errorResponse('VALIDATION_ERROR', 'year는 2000~2100 사이의 숫자여야 합니다'),
      { status: 400 },
    )
  }

  const result = await getAnnualBudgetSummaryService(year)
  return Response.json(result, {
    headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' },
  })
}
