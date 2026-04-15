import { NextRequest } from 'next/server'
import { getAnnualTradeReportService } from '@/lib/services/investment-service'
import { errorResponse } from '@/lib/api-response'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const yearStr = searchParams.get('year')

  if (!yearStr) {
    return Response.json(
      errorResponse('VALIDATION_ERROR', 'year 파라미터가 필요합니다'),
      { status: 400 },
    )
  }

  const year = Number(yearStr)
  if (isNaN(year) || year < 2000 || year > 2100) {
    return Response.json(
      errorResponse('VALIDATION_ERROR', '올바른 연도를 입력해주세요'),
      { status: 400 },
    )
  }

  const result = await getAnnualTradeReportService(year)
  return Response.json(result)
}
