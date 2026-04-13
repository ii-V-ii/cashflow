import { NextRequest } from 'next/server'
import { exportTransactionsCsv } from '@/lib/services/export-service'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const from = searchParams.get('from') ?? undefined
  const to = searchParams.get('to') ?? undefined

  const csv = await exportTransactionsCsv(from, to)

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="transactions_${from ?? 'all'}_${to ?? 'all'}.csv"`,
    },
  })
}
