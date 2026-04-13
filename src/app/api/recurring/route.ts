import { NextRequest } from 'next/server'
import {
  getRecurringTransactionsService,
  createRecurringTransactionService,
} from '@/lib/services/recurring-service'

export async function GET() {
  const result = await getRecurringTransactionsService()
  return Response.json(result)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const result = await createRecurringTransactionService(body)
  const status = result.success ? 201 : 400
  return Response.json(result, { status })
}
