import { NextRequest } from 'next/server'
import {
  getInvestmentTradesService,
  createTradeService,
} from '@/lib/services/investment-service'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const assetId = searchParams.get('assetId') ?? undefined
  const from = searchParams.get('from') ?? undefined
  const to = searchParams.get('to') ?? undefined

  const result = await getInvestmentTradesService(assetId, from, to)
  return Response.json(result)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const result = await createTradeService(body)
  const status = result.success ? 201 : 400
  return Response.json(result, { status })
}
