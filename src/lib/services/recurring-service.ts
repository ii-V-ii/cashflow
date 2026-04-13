import { eq, and, lte } from 'drizzle-orm'
import { getDb } from '@/db/index'
import { transactions } from '@/db/schema'
import {
  findAllRecurringTransactions,
  findActiveRecurringTransactions,
  findRecurringTransactionById,
  createRecurringTransaction,
  updateRecurringTransaction,
  deleteRecurringTransaction,
  updateNextDate,
  deactivateRecurringTransaction,
  deleteFutureByRecurringId,
  bulkInsertTransactions,
  updateAccountBalance,
  syncAssetFromAccount,
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

// C-1: pending 거래 중 date <= today인 것을 applied로 전환 + 잔액 반영
export async function processDueTransactionsService(
  today: string,
): Promise<ApiResponse<{ processed: number }>> {
  const db = getDb()

  // pending 상태이고 date <= today인 거래 조회
  const pendingRows = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.status, 'pending'),
        lte(transactions.date, today),
      ),
    )

  let processed = 0

  for (const row of pendingRows) {
    await db.transaction(async (tx) => {
      // status를 applied로 전환
      await tx.update(transactions)
        .set({ status: 'applied' })
        .where(eq(transactions.id, row.id))

      // 잔액 반영
      const type = row.type as 'income' | 'expense' | 'transfer'
      switch (type) {
        case 'income':
          await updateAccountBalance(row.accountId, row.amount, tx)
          break
        case 'expense':
          await updateAccountBalance(row.accountId, -row.amount, tx)
          if (row.toAccountId) {
            await updateAccountBalance(row.toAccountId, row.amount, tx)
          }
          break
        case 'transfer':
          await updateAccountBalance(row.accountId, -row.amount, tx)
          if (row.toAccountId) {
            await updateAccountBalance(row.toAccountId, row.amount, tx)
          }
          break
      }

      // 자산 동기화
      await syncAssetFromAccount(row.accountId, tx)
      if (row.toAccountId) {
        await syncAssetFromAccount(row.toAccountId, tx)
      }
    })

    // 정기거래의 nextDate 업데이트
    if (row.recurringId) {
      const nextDate = calculateNextDate(
        row.date,
        'monthly' as RecurringFrequency, // 기본값; 실제 frequency는 아래서 조회
        1,
      )
      // 정기거래 정보로 정확한 nextDate 계산
      const recurring = await findRecurringTransactionById(row.recurringId)
      if (recurring) {
        const correctNextDate = calculateNextDate(
          row.date,
          recurring.frequency as RecurringFrequency,
          recurring.interval,
        )
        if (recurring.endDate && correctNextDate > recurring.endDate) {
          await deactivateRecurringTransaction(recurring.id)
        } else {
          await updateNextDate(recurring.id, correctNextDate)
        }
      }
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
  const originalDay = date.getDate()

  switch (frequency) {
    case 'daily':
      date.setDate(date.getDate() + interval)
      break
    case 'weekly':
      date.setDate(date.getDate() + interval * 7)
      break
    case 'monthly':
      date.setMonth(date.getMonth() + interval)
      // H-5: 월말 보정 (예: 1/31 + 1개월 → 3/3이 아닌 2/28)
      if (date.getDate() !== originalDay) {
        date.setDate(0) // 이전 달 마지막 날
      }
      break
    case 'yearly':
      date.setFullYear(date.getFullYear() + interval)
      // H-5: 윤년 보정 (예: 2/29 + 1년 → 2/28)
      if (date.getDate() !== originalDay) {
        date.setDate(0)
      }
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
