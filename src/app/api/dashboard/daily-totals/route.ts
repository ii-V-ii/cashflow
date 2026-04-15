import { NextRequest } from 'next/server'
import { getDailyTotals } from '@/lib/services/dashboard-service'
import { errorResponse } from '@/lib/api-response'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const yearStr = searchParams.get('year')
  const monthStr = searchParams.get('month')

  if (!yearStr || !monthStr) {
    return Response.json(
      errorResponse('VALIDATION_ERROR', 'year, month 파라미터가 필요합니다'),
      { status: 400 },
    )
  }

  const year = Number(yearStr)
  const month = Number(monthStr)

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return Response.json(
      errorResponse('VALIDATION_ERROR', '올바른 연도/월을 입력해주세요'),
      { status: 400 },
    )
  }

  const result = await getDailyTotals(year, month)
  return Response.json(result)
}
