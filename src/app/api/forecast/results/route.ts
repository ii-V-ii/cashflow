import { NextRequest } from 'next/server'
import { getForecastResultsService } from '@/lib/services/forecast-service'

export async function GET(request: NextRequest) {
  const scenarioId = request.nextUrl.searchParams.get('scenarioId')
  if (!scenarioId) {
    return Response.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'scenarioId가 필요합니다' } },
      { status: 400 },
    )
  }

  const result = await getForecastResultsService(scenarioId)
  const status = result.success ? 200 : 404
  return Response.json(result, { status })
}
