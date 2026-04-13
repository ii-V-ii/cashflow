import {
  findAllRecurringTransactions,
  findActiveRecurringTransactions,
  findDueRecurringTransactions,
  findRecurringTransactionById,
  createRecurringTransaction,
  updateRecurringTransaction,
  deleteRecurringTransaction,
  updateNextDate,
  deactivateRecurringTransaction,
  createTransaction,
  deleteFutureByRecurringId,
  bulkInsertTransactions,
} from '@/db/repositories'
import type { BulkTransactionItem } from '@/db/repositories'
import {
  createRecurringTransactionSchema,
  updateRecurringTransactionSchema,
} from '@/lib/validators'
import { successResponse, errorResponse } from '@/lib/api-response'
import type { ApiResponse, RecurringFrequency } from '@/types'

export async function getRecurringTransactionsService(): Promise<ApiResponse<
  Awaited<ReturnType<typeof findAllRecurringTransactions>>
>> {
  return successResponse(await findAllRecurringTransactions())
}

export async function getActiveRecurringTransactionsService(): Promise<ApiResponse<
  Awaited<ReturnType<typeof findActiveRecurringTransactions>>
>> {
  return successResponse(await findActiveRecurringTransactions())
}

export async function getRecurringTransactionByIdService(
  id: string,
): Promise<ApiResponse<Awaited<ReturnType<typeof findRecurringTransactionById>>>> {
  const recurring = await findRecurringTransactionById(id)
  if (!recurring) {
    return errorResponse('NOT_FOUND', '정기 거래를 찾을 수 없습니다')
  }
  return successResponse(recurring)
}

export async function createRecurringTransactionService(
  input: unknown,
): Promise<ApiResponse<Awaited<ReturnType<typeof findRecurringTransactionById>>>> {
  const parsed = createRecurringTransactionSchema.safeParse(input)
  if (!parsed.success) {
    return errorResponse(
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다',
    )
  }
  const recurring = await createRecurringTransaction(parsed.data)

  // 미래 거래 일괄 생성
  await generateFutureTransactions(recurring)

  return successResponse(recurring)
}

export async function updateRecurringTransactionService(
  id: string,
  input: unknown,
): Promise<ApiResponse<Awaited<ReturnType<typeof findRecurringTransactionById>>>> {
  const parsed = updateRecurringTransactionSchema.safeParse(input)
  if (!parsed.success) {
    return errorResponse(
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다',
    )
  }
  const recurring = await updateRecurringTransaction(id, parsed.data)
  if (!recurring) {
    return errorResponse('NOT_FOUND', '정기 거래를 찾을 수 없습니다')
  }

  // 미래 거래 삭제 후 재생성
  const today = new Date().toISOString().slice(0, 10)
  await deleteFutureByRecurringId(id, today)
  await generateFutureTransactions(recurring)

  return successResponse(recurring)
}

export async function deleteRecurringTransactionService(
  id: string,
): Promise<ApiResponse<{ deleted: true }>> {
  const existing = await findRecurringTransactionById(id)
  if (!existing) {
    return errorResponse('NOT_FOUND', '정기 거래를 찾을 수 없습니다')
  }

  // 오늘(포함) 이후 연결 거래 일괄 삭제
  const today = new Date().toISOString().slice(0, 10)
  await deleteFutureByRecurringId(id, today)

  await deleteRecurringTransaction(id)
  return successResponse({ deleted: true })
}

export async function processDueTransactionsService(
  today: string,
): Promise<ApiResponse<{ processed: number }>> {
  const dueItems = await findDueRecurringTransactions(today)
  let processed = 0

  for (const item of dueItems) {
    // 종료일 초과 시 비활성화
    if (item.endDate && item.nextDate > item.endDate) {
      await deactivateRecurringTransaction(item.id)
      continue
    }

    // 거래 생성
    await createTransaction({
      type: item.type,
      amount: item.amount,
      description: item.description,
      categoryId: item.categoryId,
      accountId: item.accountId,
      toAccountId: item.toAccountId,
      date: item.nextDate,
      memo: null,
      tags: [],
    })

    // 다음 실행일 계산
    const nextDate = calculateNextDate(
      item.nextDate,
      item.frequency as RecurringFrequency,
      item.interval,
    )

    // 종료일 초과 시 비활성화, 아니면 nextDate 업데이트
    if (item.endDate && nextDate > item.endDate) {
      await deactivateRecurringTransaction(item.id)
    } else {
      await updateNextDate(item.id, nextDate)
    }

    processed++
  }

  return successResponse({ processed })
}

export function calculateNextDate(
  currentDate: string,
  frequency: RecurringFrequency,
  interval: number,
): string {
  const date = new Date(currentDate + 'T00:00:00')

  switch (frequency) {
    case 'daily':
      date.setDate(date.getDate() + interval)
      break
    case 'weekly':
      date.setDate(date.getDate() + interval * 7)
      break
    case 'monthly':
      date.setMonth(date.getMonth() + interval)
      break
    case 'yearly':
      date.setFullYear(date.getFullYear() + interval)
      break
  }

  return formatDateToYMD(date)
}

function formatDateToYMD(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const DEFAULT_FUTURE_MONTHS = 12

async function generateFutureTransactions(
  recurring: NonNullable<Awaited<ReturnType<typeof findRecurringTransactionById>>>,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)

  // endDate가 있으면 그 날짜까지, 없으면 startDate로부터 12개월
  const limitDate = recurring.endDate ?? calculateLimitDate(recurring.startDate, DEFAULT_FUTURE_MONTHS)

  const freq = recurring.frequency as RecurringFrequency
  const items: BulkTransactionItem[] = []

  let currentDate = recurring.startDate
  // startDate가 과거이면 오늘 이후로 건너뛰기
  while (currentDate < today) {
    currentDate = calculateNextDate(currentDate, freq, recurring.interval)
  }

  while (currentDate <= limitDate) {
    items.push({
      type: recurring.type as 'income' | 'expense' | 'transfer',
      amount: recurring.amount,
      description: recurring.description,
      categoryId: recurring.categoryId,
      accountId: recurring.accountId,
      toAccountId: recurring.toAccountId,
      recurringId: recurring.id,
      date: currentDate,
    })
    currentDate = calculateNextDate(currentDate, freq, recurring.interval)
  }

  await bulkInsertTransactions(items)
}

function calculateLimitDate(startDate: string, months: number): string {
  const date = new Date(startDate + 'T00:00:00')
  date.setMonth(date.getMonth() + months)
  return formatDateToYMD(date)
}
