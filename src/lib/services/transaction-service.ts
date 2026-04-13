import {
  createTransaction,
  updateTransaction,
  findAllTransactions,
  findTransactionById,
  deleteTransaction,
  findAccountById,
} from '@/db/repositories'
import { createTransactionSchema, updateTransactionSchema } from '@/lib/validators'
import { successResponse, errorResponse, paginatedResponse } from '@/lib/api-response'
import type { ApiResponse, PaginatedResponse, TransactionFilter, PaginationParams } from '@/types'

export async function createTransactionService(
  input: unknown,
): Promise<ApiResponse<Awaited<ReturnType<typeof findTransactionById>>>> {
  const parsed = createTransactionSchema.safeParse(input)
  if (!parsed.success) {
    return errorResponse('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다')
  }

  const data = parsed.data

  const account = await findAccountById(data.accountId)
  if (!account) {
    return errorResponse('ACCOUNT_NOT_FOUND', `계좌를 찾을 수 없습니다: ${data.accountId}`)
  }

  if (data.type === 'transfer' && data.toAccountId) {
    const toAccount = await findAccountById(data.toAccountId)
    if (!toAccount) {
      return errorResponse('ACCOUNT_NOT_FOUND', `도착 계좌를 찾을 수 없습니다: ${data.toAccountId}`)
    }
  }

  const transaction = await createTransaction(data)
  return successResponse(transaction)
}

export async function getTransactionsService(
  filter?: TransactionFilter,
  pagination?: PaginationParams,
): Promise<PaginatedResponse<Awaited<ReturnType<typeof findTransactionById>>>> {
  const { data, total, page, limit } = await findAllTransactions(filter, pagination)
  return paginatedResponse(data, { total, page, limit })
}

export async function getTransactionByIdService(
  id: string,
): Promise<ApiResponse<Awaited<ReturnType<typeof findTransactionById>>>> {
  const transaction = await findTransactionById(id)
  if (!transaction) {
    return errorResponse('NOT_FOUND', `거래를 찾을 수 없습니다: ${id}`)
  }
  return successResponse(transaction)
}

export async function updateTransactionService(
  id: string,
  input: unknown,
): Promise<ApiResponse<Awaited<ReturnType<typeof findTransactionById>>>> {
  const parsed = updateTransactionSchema.safeParse(input)
  if (!parsed.success) {
    return errorResponse('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다')
  }

  const data = parsed.data

  if (data.accountId) {
    const account = await findAccountById(data.accountId)
    if (!account) {
      return errorResponse('ACCOUNT_NOT_FOUND', `계좌를 찾을 수 없습니다: ${data.accountId}`)
    }
  }

  if (data.type === 'transfer' && data.toAccountId) {
    const toAccount = await findAccountById(data.toAccountId)
    if (!toAccount) {
      return errorResponse('ACCOUNT_NOT_FOUND', `도착 계좌를 찾을 수 없습니다: ${data.toAccountId}`)
    }
  }

  const transaction = await updateTransaction(id, data)
  if (!transaction) {
    return errorResponse('NOT_FOUND', `거래를 찾을 수 없습니다: ${id}`)
  }
  return successResponse(transaction)
}

export async function deleteTransactionService(
  id: string,
): Promise<ApiResponse<{ deleted: true }>> {
  const deleted = await deleteTransaction(id)
  if (!deleted) {
    return errorResponse('NOT_FOUND', `거래를 찾을 수 없습니다: ${id}`)
  }
  return successResponse({ deleted: true })
}
