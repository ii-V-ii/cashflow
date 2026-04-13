import { NextRequest } from 'next/server'
import { runForecastService } from '@/lib/services/forecast-service'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const result = await runForecastService(body)
  const status = result.success ? 200 : 400
  return Response.json(result, { status })
}
