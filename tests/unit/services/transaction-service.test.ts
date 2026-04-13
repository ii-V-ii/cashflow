import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db/repositories', () => ({
  createTransaction: vi.fn(),
  findAllTransactions: vi.fn(),
  findTransactionById: vi.fn(),
  deleteTransaction: vi.fn(),
  findAccountById: vi.fn(),
  findCategoryById: vi.fn(),
}))

import {
  createTransactionService,
  getTransactionsService,
  getTransactionByIdService,
  deleteTransactionService,
} from '@/lib/services/transaction-service'
import * as repos from '@/db/repositories'

const mockRepos = vi.mocked(repos)

describe('createTransactionService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRepos.findAccountById.mockResolvedValue({
      id: 'acc_1', name: '신한', type: 'bank', initialBalance: 1000000, currentBalance: 1000000,
      color: null, icon: null, isActive: true, sortOrder: 0,
      createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
    })
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
    const mockTransaction = { id: 'tx_1', ...validInput, toAccountId: null, recurringId: null, memo: null, tags: [], createdAt: new Date(), updatedAt: new Date() }
    mockRepos.createTransaction.mockResolvedValue(mockTransaction)

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

  it('존재하지 않는 계좌면 에러를 반환한다', async () => {
    mockRepos.findAccountById.mockResolvedValue(null as any)

    const result = await createTransactionService(validInput)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('ACCOUNT_NOT_FOUND')
    }
  })

  it('이체 시 도착 계좌를 검증한다', async () => {
    const secondAccount = {
      id: 'acc_2', name: '국민', type: 'bank' as const, initialBalance: 500000, currentBalance: 500000,
      color: null, icon: null, isActive: true, sortOrder: 1,
      createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
    }
    mockRepos.findAccountById
      .mockResolvedValueOnce({ ...secondAccount, id: 'acc_1' })
      .mockResolvedValueOnce(secondAccount)

    const transferInput = {
      type: 'transfer' as const,
      amount: 50000,
      description: '이체',
      accountId: 'acc_1',
      toAccountId: 'acc_2',
      date: '2026-04-01',
    }
    const mockTx = { id: 'tx_2', ...transferInput, categoryId: null, recurringId: null, memo: null, tags: [], createdAt: new Date(), updatedAt: new Date() }
    mockRepos.createTransaction.mockResolvedValue(mockTx)

    const result = await createTransactionService(transferInput)
    expect(result.success).toBe(true)
  })

  it('이체 시 도착 계좌가 존재하지 않으면 에러를 반환한다', async () => {
    mockRepos.findAccountById
      .mockResolvedValueOnce({
        id: 'acc_1', name: '신한', type: 'bank', initialBalance: 1000000, currentBalance: 1000000,
        color: null, icon: null, isActive: true, sortOrder: 0,
        createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
      })
      .mockResolvedValueOnce(null as any)

    const result = await createTransactionService({
      type: 'transfer',
      amount: 50000,
      description: '이체',
      accountId: 'acc_1',
      toAccountId: 'acc_nonexistent',
      date: '2026-04-01',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('ACCOUNT_NOT_FOUND')
    }
  })
})

describe('getTransactionsService', () => {
  it('거래 목록과 페이지네이션을 반환한다', async () => {
    mockRepos.findAllTransactions.mockResolvedValue({
      data: [{ id: 'tx_1', type: 'expense' as const, amount: 10000, description: '테스트', categoryId: null, accountId: 'acc_1', toAccountId: null, recurringId: null, date: '2026-04-01', memo: null, tags: [], createdAt: new Date(), updatedAt: new Date() }],
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
    mockRepos.findTransactionById.mockResolvedValue({ id: 'tx_1', type: 'expense' as const, amount: 10000, description: '테스트', categoryId: null, accountId: 'acc_1', toAccountId: null, recurringId: null, date: '2026-04-01', memo: null, tags: [], createdAt: new Date(), updatedAt: new Date() })

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
