import {
  findAllBudgets,
  findBudgetById,
  findBudgetByYearMonth,
  createBudget as createBudgetRepo,
  updateBudget as updateBudgetRepo,
  deleteBudget as deleteBudgetRepo,
  getBudgetItemsWithActuals,
  getBudgetItems,
  getMonthlyActuals,
} from '@/db/repositories'
import {
  createBudgetSchema,
  updateBudgetSchema,
  copyBudgetSchema,
} from '@/lib/validators'
import { successResponse, errorResponse } from '@/lib/api-response'
import type {
  ApiResponse,
  BudgetWithItems,
  AnnualBudgetSummary,
  MonthlyBudgetSummary,
} from '@/types'

export async function createBudgetService(
  input: unknown,
): Promise<ApiResponse<Awaited<ReturnType<typeof findBudgetById>>>> {
  const parsed = createBudgetSchema.safeParse(input)
  if (!parsed.success) {
    return errorResponse('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다')
  }

  const data = parsed.data
  const existing = await findBudgetByYearMonth(data.year, data.month ?? null)
  if (existing) {
    const label = data.month ? `${data.year}년 ${data.month}월` : `${data.year}년 연간`
    return errorResponse('DUPLICATE', `${label} 예산이 이미 존재합니다`)
  }

  const budget = await createBudgetRepo(data)
  return successResponse(budget)
}

export async function getBudgetByIdService(
  id: string,
): Promise<ApiResponse<Awaited<ReturnType<typeof findBudgetById>>>> {
  const budget = await findBudgetById(id)
  if (!budget) {
    return errorResponse('NOT_FOUND', `예산을 찾을 수 없습니다: ${id}`)
  }
  return successResponse(budget)
}

export async function getBudgetsService(year?: number) {
  const data = await findAllBudgets(year)
  return successResponse(data)
}

export async function updateBudgetService(
  id: string,
  input: unknown,
): Promise<ApiResponse<Awaited<ReturnType<typeof findBudgetById>>>> {
  const parsed = updateBudgetSchema.safeParse(input)
  if (!parsed.success) {
    return errorResponse('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다')
  }

  const budget = await updateBudgetRepo(id, parsed.data)
  if (!budget) {
    return errorResponse('NOT_FOUND', `예산을 찾을 수 없습니다: ${id}`)
  }

  return successResponse(budget)
}

export async function deleteBudgetService(
  id: string,
): Promise<ApiResponse<{ deleted: true }>> {
  const deleted = await deleteBudgetRepo(id)
  if (!deleted) {
    return errorResponse('NOT_FOUND', `예산을 찾을 수 없습니다: ${id}`)
  }
  return successResponse({ deleted: true })
}

export async function getBudgetWithActualsService(
  id: string,
): Promise<ApiResponse<BudgetWithItems>> {
  const budget = await findBudgetById(id)
  if (!budget) {
    return errorResponse('NOT_FOUND', `예산을 찾을 수 없습니다: ${id}`)
  }

  if (budget.month === null) {
    return errorResponse('INVALID_REQUEST', '연간 예산은 실적 대비를 지원하지 않습니다')
  }

  const items = await getBudgetItemsWithActuals(id, budget.year, budget.month)

  return successResponse({
    ...budget,
    items,
  })
}

export async function copyBudgetFromPreviousMonthService(
  input: unknown,
): Promise<ApiResponse<Awaited<ReturnType<typeof findBudgetById>>>> {
  const parsed = copyBudgetSchema.safeParse(input)
  if (!parsed.success) {
    return errorResponse('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다')
  }

  const { sourceYear, sourceMonth, targetYear, targetMonth } = parsed.data

  const source = await findBudgetByYearMonth(sourceYear, sourceMonth)
  if (!source) {
    return errorResponse('NOT_FOUND', `${sourceYear}년 ${sourceMonth}월 예산을 찾을 수 없습니다`)
  }

  const existing = await findBudgetByYearMonth(targetYear, targetMonth)
  if (existing) {
    return errorResponse('DUPLICATE', `${targetYear}년 ${targetMonth}월 예산이 이미 존재합니다`)
  }

  const sourceItems = await getBudgetItems(source.id)

  const budget = await createBudgetRepo({
    name: `${targetYear}년 ${targetMonth}월 예산`,
    year: targetYear,
    month: targetMonth,
    totalIncome: source.totalIncome,
    totalExpense: source.totalExpense,
    memo: `${sourceYear}년 ${sourceMonth}월 예산에서 복사`,
    items: sourceItems.map((item) => ({
      categoryId: item.categoryId,
      plannedAmount: item.plannedAmount,
      memo: item.memo,
    })),
  })

  return successResponse(budget)
}

export async function getAnnualBudgetSummaryService(
  year: number,
): Promise<ApiResponse<AnnualBudgetSummary>> {
  const yearBudgets = await findAllBudgets(year)
  const monthlyActuals = await getMonthlyActuals(year)

  const actualMap = new Map<number, { income: number; expense: number }>()
  for (const row of monthlyActuals) {
    const existing = actualMap.get(row.month) ?? { income: 0, expense: 0 }
    if (row.type === 'income') {
      existing.income = row.total
    } else if (row.type === 'expense') {
      existing.expense = row.total
    }
    actualMap.set(row.month, existing)
  }

  const budgetMap = new Map(
    yearBudgets
      .filter((b) => b.month !== null)
      .map((b) => [b.month!, b]),
  )

  const months: MonthlyBudgetSummary[] = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1
    const budget = budgetMap.get(month)
    const actual = actualMap.get(month) ?? { income: 0, expense: 0 }

    return {
      month,
      budgetId: budget?.id ?? null,
      plannedIncome: budget?.totalIncome ?? 0,
      plannedExpense: budget?.totalExpense ?? 0,
      actualIncome: actual.income,
      actualExpense: actual.expense,
    }
  })

  const totalPlannedIncome = months.reduce((sum, m) => sum + m.plannedIncome, 0)
  const totalPlannedExpense = months.reduce((sum, m) => sum + m.plannedExpense, 0)
  const totalActualIncome = months.reduce((sum, m) => sum + m.actualIncome, 0)
  const totalActualExpense = months.reduce((sum, m) => sum + m.actualExpense, 0)

  return successResponse({
    year,
    months,
    totalPlannedIncome,
    totalPlannedExpense,
    totalActualIncome,
    totalActualExpense,
  })
}
