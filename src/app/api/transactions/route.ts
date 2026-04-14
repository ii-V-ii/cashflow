import { NextRequest } from 'next/server'
import {
  createTransactionService,
  getTransactionsService,
} from '@/lib/services/transaction-service'
import type { TransactionFilter, TransactionType } from '@/types'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const filter = parseFilter(searchParams)
  const page = Number(searchParams.get('page')) || 1
  const limit = Number(searchParams.get('limit')) || 20

  const result = await getTransactionsService(filter, { page, limit })
  return Response.json(result)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const result = await createTransactionService(body)

  if (!result.success) {
    return Response.json(result, { status: 400 })
  }

  return Response.json(result, { status: 201 })
}

function parseFilter(params: URLSearchParams): TransactionFilter | undefined {
  const filter: TransactionFilter = {}
  let hasFilter = false

  const type = params.get('type')
  if (type && ['income', 'expense', 'transfer'].includes(type)) {
    (filter as { type: TransactionType }).type = type as TransactionType
    hasFilter = true
  }

  const categoryId = params.get('categoryId')
  if (categoryId) {
    (filter as { categoryId: string }).categoryId = categoryId
    hasFilter = true
  }

  const accountId = params.get('accountId')
  if (accountId) {
    (filter as { accountId: string }).accountId = accountId
    hasFilter = true
  }

  const from = params.get('from')
  const to = params.get('to')
  if (from || to) {
    (filter as { dateRange: { from: string; to: string } }).dateRange = {
      from: from ?? '1970-01-01',
      to: to ?? '9999-12-31',
    }
    hasFilter = true
  }

  const search = params.get('search')
  if (search) {
    (filter as { search: string }).search = search
    hasFilter = true
  }

  const tagsParam = params.get('tags')
  if (tagsParam) {
    const tagList = tagsParam.split(',').map((t) => t.trim()).filter(Boolean)
    if (tagList.length > 0) {
      (filter as { tags: string[] }).tags = tagList
      hasFilter = true
    }
  }

  return hasFilter ? filter : undefined
}
