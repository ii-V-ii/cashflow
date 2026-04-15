import { NextRequest } from 'next/server'
import { getAssetInvestmentSummaryService } from '@/lib/services/investment-service'
import { errorResponse } from '@/lib/api-response'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const assetId = searchParams.get('assetId')

  if (!assetId) {
    return Response.json(
      errorResponse('VALIDATION_ERROR', 'assetId 파라미터가 필요합니다'),
      { status: 400 },
    )
  }

  const result = await getAssetInvestmentSummaryService(assetId)
  const status = result.success ? 200 : 404
  return Response.json(result, { status })
}
