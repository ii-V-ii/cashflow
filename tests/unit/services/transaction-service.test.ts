import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db/repositories', () => ({
  createTransaction: vi.fn(),
  findAllTransactions: vi.fn(),
  findTransactionById: vi.fn(),
  deleteTransaction: vi.fn(),
}))

import {
  createTransactionService,
  getTransactionsService,
  getTransactionByIdService,
  deleteTransactionService,
} from '@/lib/services/transaction-service'
import * as repos from '@/db/repositories'

const mockRepos = vi.mocked(repos)

const fullTransaction = {
  id: 'tx_1',
  type: 'expense' as const,
  amount: 15000,
  description: '점심',
  status: 'applied' as const,
  categoryId: 'cat_1',
  accountId: 'acc_1',
  toAccountId: null,
  recurringId: null,
  date: '2026-04-01',
  memo: null,
  installmentMonths: null,
  installmentCurrent: null,
  tags: [] as string[],
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('createTransactionService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const validInput = {
    type: 'expense' as const,
    amount: 15000,
    description: '점심',
    categoryId: 'cat_1',
    accountId: 'acc_1',
    date: '2026-04-01',
  }

  it('유효한 입력으로 거래를 생성한다', async () => {
    mockRepos.createTransaction.mockResolvedValue(fullTransaction)

    const result = await createTransactionService(validInput)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data!.id).toBe('tx_1')
    }
  })

  it('잘못된 입력이면 에러를 반환한다', async () => {
    const result = await createTransactionService({ ...validInput, amount: -100 })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR')
    }
  })

  it('이체 시 도착 계좌가 필요하다', async () => {
    const transferInput = {
      type: 'transfer' as const,
      amount: 50000,
      description: '이체',
      accountId: 'acc_1',
      date: '2026-04-01',
      // toAccountId 누락
    }

    const result = await createTransactionService(transferInput)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR')
    }
  })

  it('유효한 이체를 생성한다', async () => {
    const transferTx = {
      ...fullTransaction,
      id: 'tx_2',
      type: 'transfer' as const,
      amount: 50000,
      description: '이체',
      categoryId: null,
      toAccountId: 'acc_2',
    }
    mockRepos.createTransaction.mockResolvedValue(transferTx)

    const result = await createTransactionService({
      type: 'transfer',
      amount: 50000,
      description: '이체',
      accountId: 'acc_1',
      toAccountId: 'acc_2',
      date: '2026-04-01',
    })
    expect(result.success).toBe(true)
  })
})

describe('getTransactionsService', () => {
  it('거래 목록과 페이지네이션을 반환한다', async () => {
    mockRepos.findAllTransactions.mockResolvedValue({
      data: [fullTransaction],
      total: 1,
      page: 1,
      limit: 20,
    })

    const result = await getTransactionsService()
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(1)
      expect(result.meta).toBeDefined()
    }
  })
})

describe('getTransactionByIdService', () => {
  it('존재하는 거래를 반환한다', async () => {
    mockRepos.findTransactionById.mockResolvedValue(fullTransaction)

    const result = await getTransactionByIdService('tx_1')
    expect(result.success).toBe(true)
  })

  it('존재하지 않으면 에러를 반환한다', async () => {
    mockRepos.findTransactionById.mockResolvedValue(null)

    const result = await getTransactionByIdService('tx_none')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('NOT_FOUND')
    }
  })
})

describe('deleteTransactionService', () => {
  it('거래를 삭제한다', async () => {
    mockRepos.deleteTransaction.mockResolvedValue(true)

    const result = await deleteTransactionService('tx_1')
    expect(result.success).toBe(true)
  })

  it('존재하지 않으면 에러를 반환한다', async () => {
    mockRepos.deleteTransaction.mockResolvedValue(false)

    const result = await deleteTransactionService('tx_none')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('NOT_FOUND')
    }
  })
})
