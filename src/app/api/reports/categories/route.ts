import { NextRequest } from 'next/server'
import { getCategoryAnalysis } from '@/lib/services/report-service'
import { errorResponse } from '@/lib/api-response'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const yearParam = searchParams.get('year')
  const monthParam = searchParams.get('month')

  if (!yearParam || !monthParam) {
    return Response.json(
      errorResponse('VALIDATION_ERROR', 'year, month 파라미터가 필요합니다'),
      { status: 400 },
    )
  }

  const year = Number(yearParam)
  const month = Number(monthParam)

  if (isNaN(year) || year < 2000 || year > 2100) {
    return Response.json(
      errorResponse('VALIDATION_ERROR', 'year는 2000~2100 사이의 숫자여야 합니다'),
      { status: 400 },
    )
  }

  if (isNaN(month) || month < 1 || month > 12) {
    return Response.json(
      errorResponse('VALIDATION_ERROR', 'month는 1~12 사이의 숫자여야 합니다'),
      { status: 400 },
    )
  }

  const result = await getCategoryAnalysis(year, month)
  return Response.json(result)
}
