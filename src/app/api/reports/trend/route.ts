import { NextRequest } from 'next/server'
import { getIncomeExpenseTrend } from '@/lib/services/report-service'
import { errorResponse } from '@/lib/api-response'

const YEAR_MONTH_REGEX = /^\d{4}-(?:0[1-9]|1[0-2])$/

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  if (!from || !to) {
    return Response.json(
      errorResponse('VALIDATION_ERROR', 'from, to 파라미터가 필요합니다 (YYYY-MM 형식)'),
      { status: 400 },
    )
  }

  if (!YEAR_MONTH_REGEX.test(from) || !YEAR_MONTH_REGEX.test(to)) {
    return Response.json(
      errorResponse('VALIDATION_ERROR', 'from, to는 YYYY-MM 형식이어야 합니다'),
      { status: 400 },
    )
  }

  if (from > to) {
    return Response.json(
      errorResponse('VALIDATION_ERROR', 'from은 to보다 이전이어야 합니다'),
      { status: 400 },
    )
  }

  const result = await getIncomeExpenseTrend(from, to)
  return Response.json(result)
}
