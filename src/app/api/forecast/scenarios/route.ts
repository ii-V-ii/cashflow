import { NextRequest } from 'next/server'
import {
  getForecastScenariosService,
  createForecastScenarioService,
} from '@/lib/services/forecast-service'

export async function GET() {
  const result = await getForecastScenariosService()
  return Response.json(result)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const result = await createForecastScenarioService(body)
  const status = result.success ? 201 : 400
  return Response.json(result, { status })
}
