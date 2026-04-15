import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db/repositories', () => ({
  findAllRecurringTransactions: vi.fn(),
  findActiveRecurringTransactions: vi.fn(),
  findRecurringTransactionById: vi.fn(),
  createRecurringTransaction: vi.fn(),
  updateRecurringTransaction: vi.fn(),
  deleteRecurringTransaction: vi.fn(),
  updateNextDate: vi.fn(),
  deactivateRecurringTransaction: vi.fn(),
  deleteFutureByRecurringId: vi.fn(),
  bulkInsertTransactions: vi.fn(),
  updateAccountBalance: vi.fn(),
  syncAssetFromAccount: vi.fn(),
}))

vi.mock('@/db/index', () => ({
  getDb: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
    transaction: vi.fn(async (fn: any) => fn({
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn() }) }),
    })),
  })),
}))

vi.mock('@/db/schema', () => ({
  transactions: { id: 'id', status: 'status', date: 'date' },
  recurringTransactions: { id: 'id' },
}))

import {
  getRecurringTransactionsService,
  getRecurringTransactionByIdService,
  createRecurringTransactionService,
  deleteRecurringTransactionService,
  processDueTransactionsService,
  calculateNextDate,
} from '@/lib/services/recurring-service'
import * as repos from '@/db/repositories'

const mockRepos = vi.mocked(repos)

const mockRecurring = {
  id: 'rec_1', type: 'expense', amount: 50000, description: '넷플릭스',
  categoryId: null, accountId: 'acc_1', toAccountId: null,
  frequency: 'monthly', interval: 1,
  startDate: '2026-01-01', endDate: null, nextDate: '2026-05-01',
  isActive: true, createdAt: new Date(), updatedAt: new Date(),
}

describe('calculateNextDate', () => {
  it('일 단위 다음 날짜를 계산한다', () => {
    expect(calculateNextDate('2026-04-15', 'daily', 1)).toBe('2026-04-16')
    expect(calculateNextDate('2026-04-15', 'daily', 3)).toBe('2026-04-18')
  })

  it('주 단위 다음 날짜를 계산한다', () => {
    expect(calculateNextDate('2026-04-15', 'weekly', 1)).toBe('2026-04-22')
    expect(calculateNextDate('2026-04-15', 'weekly', 2)).toBe('2026-04-29')
  })

  it('월 단위 다음 날짜를 계산한다', () => {
    expect(calculateNextDate('2026-04-15', 'monthly', 1)).toBe('2026-05-15')
    expect(calculateNextDate('2026-04-15', 'monthly', 3)).toBe('2026-07-15')
  })

  it('년 단위 다음 날짜를 계산한다', () => {
    expect(calculateNextDate('2026-04-15', 'yearly', 1)).toBe('2027-04-15')
  })

  it('월말 보정: 1/31 + 1개월 = 2/28', () => {
    const result = calculateNextDate('2026-01-31', 'monthly', 1)
    expect(result).toBe('2026-02-28')
  })

  it('월말 보정: 3/31 + 1개월 = 4/30', () => {
    expect(calculateNextDate('2026-03-31', 'monthly', 1)).toBe('2026-04-30')
  })

  it('연도 넘김: 12/15 + 1개월 = 1/15', () => {
    expect(calculateNextDate('2026-12-15', 'monthly', 1)).toBe('2027-01-15')
  })

  it('윤년 보정: 2/29 + 1년', () => {
    // 2024는 윤년, 2025는 평년
    expect(calculateNextDate('2024-02-29', 'yearly', 1)).toBe('2025-02-28')
  })
})

describe('getRecurringTransactionsService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('전체 정기거래 목록을 반환한다', async () => {
    mockRepos.findAllRecurringTransactions.mockResolvedValue([mockRecurring] as any)
    const result = await getRecurringTransactionsService()
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toHaveLength(1)
  })
})

describe('getRecurringTransactionByIdService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('존재하는 정기거래를 반환한다', async () => {
    mockRepos.findRecurringTransactionById.mockResolvedValue(mockRecurring as any)
    const result = await getRecurringTransactionByIdService('rec_1')
    expect(result.success).toBe(true)
  })

  it('존재하지 않으면 에러를 반환한다', async () => {
    mockRepos.findRecurringTransactionById.mockResolvedValue(null)
    const result = await getRecurringTransactionByIdService('none')
    expect(result.success).toBe(false)
  })
})

describe('createRecurringTransactionService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('유효한 정기거래를 생성한다', async () => {
    mockRepos.createRecurringTransaction.mockResolvedValue(mockRecurring as any)
    mockRepos.bulkInsertTransactions.mockResolvedValue(undefined)

    const result = await createRecurringTransactionService({
      type: 'expense', amount: 50000, description: '넷플릭스',
      accountId: 'acc_1', frequency: 'monthly', startDate: '2026-01-01',
    })
    expect(result.success).toBe(true)
  })

  it('유효성 검사 실패 시 에러를 반환한다', async () => {
    const result = await createRecurringTransactionService({ type: 'expense', amount: -100 })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR')
  })

  it('이체인데 도착 계좌가 없으면 실패한다', async () => {
    const result = await createRecurringTransactionService({
      type: 'transfer', amount: 50000, description: '이체',
      accountId: 'acc_1', frequency: 'monthly', startDate: '2026-01-01',
    })
    expect(result.success).toBe(false)
  })
})

describe('deleteRecurringTransactionService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('정기거래를 삭제하고 미래 거래도 정리한다', async () => {
    mockRepos.findRecurringTransactionById.mockResolvedValue(mockRecurring as any)
    mockRepos.deleteFutureByRecurringId.mockResolvedValue(5)
    mockRepos.deleteRecurringTransaction.mockResolvedValue(true)

    const result = await deleteRecurringTransactionService('rec_1')
    expect(result.success).toBe(true)
    expect(mockRepos.deleteFutureByRecurringId).toHaveBeenCalled()
    expect(mockRepos.deleteRecurringTransaction).toHaveBeenCalled()
  })

  it('존재하지 않으면 에러를 반환한다', async () => {
    mockRepos.findRecurringTransactionById.mockResolvedValue(null)
    const result = await deleteRecurringTransactionService('none')
    expect(result.success).toBe(false)
  })
})

describe('processDueTransactionsService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('처리할 거래가 없으면 0을 반환한다', async () => {
    const result = await processDueTransactionsService('2026-04-15')
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.processed).toBe(0)
  })
})
