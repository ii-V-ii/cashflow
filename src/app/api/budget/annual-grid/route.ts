import { NextRequest } from 'next/server'
import {
  getAnnualGridService,
  updateAnnualGridCellService,
} from '@/lib/services/budget-service'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const yearParam = searchParams.get('year')

  if (!yearParam) {
    return Response.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'year 파라미터가 필요합니다' } },
      { status: 400 },
    )
  }

  const year = Number(yearParam)
  if (isNaN(year) || year < 2000 || year > 2100) {
    return Response.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'year는 2000~2100 사이의 정수여야 합니다' } },
      { status: 400 },
    )
  }

  const typeParam = searchParams.get('type') as 'income' | 'expense' | null
  const type = typeParam === 'income' || typeParam === 'expense' ? typeParam : undefined
  const expenseKindParam = searchParams.get('expenseKind') as 'consumption' | 'saving' | null
  const expenseKind = expenseKindParam === 'consumption' || expenseKindParam === 'saving' ? expenseKindParam : undefined

  const result = await getAnnualGridService(year, type, expenseKind)
  return Response.json(result)
}

export async function PUT(request: NextRequest) {
  const body = await request.json()
  const result = await updateAnnualGridCellService(body)

  if (!result.success) {
    return Response.json(result, { status: 400 })
  }

  return Response.json(result)
}
