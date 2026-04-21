import { NextRequest } from 'next/server'
import { getNetWorthTrend } from '@/lib/services/report-service'
import { errorResponse } from '@/lib/api-response'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const monthsParam = searchParams.get('months')

  const months = monthsParam ? Number(monthsParam) : 12

  if (isNaN(months) || months < 1 || months > 120) {
    return Response.json(
      errorResponse('VALIDATION_ERROR', 'months는 1~120 사이의 숫자여야 합니다'),
      { status: 400 },
    )
  }

  const result = await getNetWorthTrend(months)
  return Response.json(result, {
    headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' },
  })
}
