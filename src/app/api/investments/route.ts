import { NextRequest } from 'next/server'
import {
  getInvestmentReturnsService,
  createInvestmentReturnService,
} from '@/lib/services/investment-service'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const yearStr = searchParams.get('year')
  const monthStr = searchParams.get('month')
  const assetId = searchParams.get('assetId') ?? undefined

  const year = yearStr ? parseInt(yearStr, 10) : undefined
  const month = monthStr ? parseInt(monthStr, 10) : undefined

  const result = await getInvestmentReturnsService({ year, month, assetId })
  return Response.json(result)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const result = await createInvestmentReturnService(body)
  const status = result.success ? 201 : 400
  return Response.json(result, { status })
}
