import { getPortfolioSummaryService } from '@/lib/services/asset-service'

export async function GET() {
  const result = await getPortfolioSummaryService()
  return Response.json(result)
}
