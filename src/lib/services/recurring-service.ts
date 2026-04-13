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
} from '@/db/repositories'
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
  return successResponse(recurring)
}

export async function deleteRecurringTransactionService(
  id: string,
): Promise<ApiResponse<{ deleted: true }>> {
  const deleted = await deleteRecurringTransaction(id)
  if (!deleted) {
    return errorResponse('NOT_FOUND', '정기 거래를 찾을 수 없습니다')
  }
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
