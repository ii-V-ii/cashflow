import { NextRequest } from 'next/server'
import { getInvestmentSummaryService } from '@/lib/services/investment-service'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const yearStr = searchParams.get('year')
  const year = yearStr ? parseInt(yearStr, 10) : new Date().getFullYear()

  const result = await getInvestmentSummaryService(year)
  return Response.json(result)
}
