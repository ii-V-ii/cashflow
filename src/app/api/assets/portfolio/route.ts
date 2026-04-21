import { getPortfolioSummaryService } from '@/lib/services/asset-service'

export async function GET() {
  const result = await getPortfolioSummaryService()
  return Response.json(result, {
    headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' },
  })
}
