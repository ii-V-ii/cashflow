import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db/repositories', () => ({
  findAllTransactions: vi.fn(),
}))

import { exportTransactionsCsv } from '@/lib/services/export-service'
import * as repos from '@/db/repositories'

const mockRepos = vi.mocked(repos)

const mockTransaction = {
  id: 'tx_1', type: 'expense', amount: 15000, description: '점심',
  status: 'applied', categoryId: 'cat_1', accountId: 'acc_1',
  toAccountId: null, recurringId: null, date: '2026-04-15',
  memo: null, installmentMonths: null, installmentCurrent: null,
  tags: [], createdAt: new Date(), updatedAt: new Date(),
}

describe('exportTransactionsCsv', () => {
  beforeEach(() => vi.clearAllMocks())

  it('CSV 헤더와 데이터를 반환한다', async () => {
    mockRepos.findAllTransactions.mockResolvedValue({
      data: [mockTransaction] as any,
      total: 1, page: 1, limit: 5000,
    })

    const csv = await exportTransactionsCsv()
    const lines = csv.split('\n')

    expect(lines[0]).toBe('날짜,유형,설명,금액,카테고리ID,계좌ID,도착계좌ID,메모')
    expect(lines[1]).toContain('2026-04-15')
    expect(lines[1]).toContain('지출')
    expect(lines[1]).toContain('점심')
    expect(lines[1]).toContain('15000')
  })

  it('수입 유형을 한글로 변환한다', async () => {
    mockRepos.findAllTransactions.mockResolvedValue({
      data: [{ ...mockTransaction, type: 'income' }] as any,
      total: 1, page: 1, limit: 5000,
    })

    const csv = await exportTransactionsCsv()
    expect(csv).toContain('수입')
  })

  it('이체 유형을 한글로 변환한다', async () => {
    mockRepos.findAllTransactions.mockResolvedValue({
      data: [{ ...mockTransaction, type: 'transfer', toAccountId: 'acc_2' }] as any,
      total: 1, page: 1, limit: 5000,
    })

    const csv = await exportTransactionsCsv()
    expect(csv).toContain('이체')
    expect(csv).toContain('acc_2')
  })

  it('거래가 없으면 헤더만 반환한다', async () => {
    mockRepos.findAllTransactions.mockResolvedValue({
      data: [], total: 0, page: 1, limit: 5000,
    })

    const csv = await exportTransactionsCsv()
    const lines = csv.split('\n')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('날짜')
  })

  it('날짜 필터를 전달한다', async () => {
    mockRepos.findAllTransactions.mockResolvedValue({
      data: [], total: 0, page: 1, limit: 5000,
    })

    await exportTransactionsCsv('2026-04-01', '2026-04-30')

    expect(mockRepos.findAllTransactions).toHaveBeenCalledWith(
      { dateRange: { from: '2026-04-01', to: '2026-04-30' } },
      { page: 1, limit: 5000 },
    )
  })

  it('필터 없으면 undefined를 전달한다', async () => {
    mockRepos.findAllTransactions.mockResolvedValue({
      data: [], total: 0, page: 1, limit: 5000,
    })

    await exportTransactionsCsv()

    expect(mockRepos.findAllTransactions).toHaveBeenCalledWith(undefined, { page: 1, limit: 5000 })
  })

  it('쉼표가 포함된 설명을 이스케이프한다', async () => {
    mockRepos.findAllTransactions.mockResolvedValue({
      data: [{ ...mockTransaction, description: '점심, 저녁' }] as any,
      total: 1, page: 1, limit: 5000,
    })

    const csv = await exportTransactionsCsv()
    expect(csv).toContain('"점심, 저녁"')
  })

  it('쌍따옴표가 포함된 설명을 이스케이프한다', async () => {
    mockRepos.findAllTransactions.mockResolvedValue({
      data: [{ ...mockTransaction, description: '테스트"값' }] as any,
      total: 1, page: 1, limit: 5000,
    })

    const csv = await exportTransactionsCsv()
    expect(csv).toContain('"테스트""값"')
  })

  it('줄바꿈이 포함된 메모를 이스케이프한다', async () => {
    mockRepos.findAllTransactions.mockResolvedValue({
      data: [{ ...mockTransaction, memo: '첫줄\n둘째줄' }] as any,
      total: 1, page: 1, limit: 5000,
    })

    const csv = await exportTransactionsCsv()
    expect(csv).toContain('"첫줄\n둘째줄"')
  })

  it('5000건 초과 시 페이지네이션으로 처리한다', async () => {
    const bigBatch = Array.from({ length: 5000 }, (_, i) => ({
      ...mockTransaction, id: `tx_${i}`,
    }))

    mockRepos.findAllTransactions
      .mockResolvedValueOnce({ data: bigBatch as any, total: 7000, page: 1, limit: 5000 })
      .mockResolvedValueOnce({ data: bigBatch.slice(0, 2000) as any, total: 7000, page: 2, limit: 5000 })

    const csv = await exportTransactionsCsv()
    const lines = csv.split('\n')
    expect(lines).toHaveLength(7001) // header + 7000 rows
    expect(mockRepos.findAllTransactions).toHaveBeenCalledTimes(2)
  })
})
