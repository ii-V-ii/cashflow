import { NextRequest } from 'next/server'
import { processDueTransactionsService } from '@/lib/services/recurring-service'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = new Date().toISOString().slice(0, 10)
  const result = await processDueTransactionsService(today)

  return Response.json(result)
}
