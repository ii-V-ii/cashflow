import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockTransaction = vi.fn()

vi.mock('@/db/repositories', () => ({
  findAssetById: vi.fn(),
  findAccountById: vi.fn(),
  findInvestmentTradeById: vi.fn(),
  findAllInvestmentTrades: vi.fn(),
  updateInvestmentTrade: vi.fn(),
  getAssetTradeSummary: vi.fn(),
  updateAccountBalance: vi.fn(),
  syncAssetFromAccount: vi.fn(),
}))

vi.mock('@/db', () => ({
  getDb: vi.fn(() => ({
    transaction: mockTransaction,
  })),
}))

vi.mock('@/db/schema', () => ({
  investmentTrades: { id: 'id' },
}))

vi.mock('@/lib/utils', () => ({
  generateId: vi.fn(() => 'trade_new'),
}))

import {
  createTradeService,
  deleteTradeService,
  getInvestmentTradesService,
  getAssetInvestmentSummaryService,
} from '@/lib/services/investment-service'
import * as repos from '@/db/repositories'

const mockRepos = vi.mocked(repos)

const validTradeInput = {
  assetId: 'asset_1',
  tradeType: 'buy' as const,
  date: '2026-04-15',
  ticker: '삼성전자',
  quantity: 10,
  unitPrice: 180000,
  totalAmount: 1800000,
  fee: 0,
  tax: 0,
  netAmount: 1800000,
  accountId: 'acc_1',
}

const mockAsset = { id: 'asset_1', name: 'ISA' }
const mockAccount = { id: 'acc_1', name: 'ISA계좌' }

describe('createTradeService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRepos.findAssetById.mockResolvedValue(mockAsset as any)
    mockRepos.findAccountById.mockResolvedValue(mockAccount as any)
    mockRepos.findInvestmentTradeById.mockResolvedValue({ id: 'trade_new', ...validTradeInput } as any)
    mockTransaction.mockImplementation(async (fn) => fn({ insert: vi.fn().mockReturnValue({ values: vi.fn() }) }))
  })

  it('유효한 매수를 생성한다', async () => {
    const result = await createTradeService(validTradeInput)
    expect(result.success).toBe(true)
    expect(mockTransaction).toHaveBeenCalledTimes(1)
  })

  it('자산이 없으면 에러를 반환한다', async () => {
    mockRepos.findAssetById.mockResolvedValue(null)

    const result = await createTradeService(validTradeInput)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('ASSET_NOT_FOUND')
    }
  })

  it('계좌가 없으면 에러를 반환한다', async () => {
    mockRepos.findAccountById.mockResolvedValue(null)

    const result = await createTradeService(validTradeInput)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('ACCOUNT_NOT_FOUND')
    }
  })

  it('유효성 검사 실패 시 에러를 반환한다', async () => {
    const result = await createTradeService({ ...validTradeInput, quantity: -1 })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR')
    }
  })

  it('매수 시 잔액을 차감한다', async () => {
    let capturedTxFn: ((tx: any) => Promise<void>) | null = null
    mockTransaction.mockImplementation(async (fn) => {
      capturedTxFn = fn
      const tx = { insert: vi.fn().mockReturnValue({ values: vi.fn() }) }
      await fn(tx)
    })

    await createTradeService(validTradeInput)

    expect(mockRepos.updateAccountBalance).toHaveBeenCalledWith('acc_1', -1800000, expect.anything())
    expect(mockRepos.syncAssetFromAccount).toHaveBeenCalledWith('acc_1', expect.anything())
  })

  it('매도 시 잔액을 증가시킨다', async () => {
    mockTransaction.mockImplementation(async (fn) => {
      const tx = { insert: vi.fn().mockReturnValue({ values: vi.fn() }) }
      await fn(tx)
    })

    await createTradeService({ ...validTradeInput, tradeType: 'sell', netAmount: 1790000 })

    expect(mockRepos.updateAccountBalance).toHaveBeenCalledWith('acc_1', 1790000, expect.anything())
  })

  it('accountId 없으면 잔액 변경 안 함', async () => {
    mockTransaction.mockImplementation(async (fn) => {
      const tx = { insert: vi.fn().mockReturnValue({ values: vi.fn() }) }
      await fn(tx)
    })

    await createTradeService({ ...validTradeInput, accountId: null })

    expect(mockRepos.updateAccountBalance).not.toHaveBeenCalled()
    expect(mockRepos.syncAssetFromAccount).not.toHaveBeenCalled()
  })
})

describe('deleteTradeService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRepos.findInvestmentTradeById.mockResolvedValue({
      id: 'trade_1', tradeType: 'buy', totalAmount: 1800000, netAmount: 1800000, accountId: 'acc_1',
    } as any)
    mockTransaction.mockImplementation(async (fn) => {
      const tx = { delete: vi.fn().mockReturnValue({ where: vi.fn() }) }
      await fn(tx)
    })
  })

  it('매매 기록을 삭제한다', async () => {
    const result = await deleteTradeService('trade_1')
    expect(result.success).toBe(true)
    expect(mockTransaction).toHaveBeenCalledTimes(1)
  })

  it('존재하지 않으면 에러를 반환한다', async () => {
    mockRepos.findInvestmentTradeById.mockResolvedValue(null)

    const result = await deleteTradeService('trade_none')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('NOT_FOUND')
    }
  })

  it('매수 삭제 시 잔액을 복원한다', async () => {
    await deleteTradeService('trade_1')

    expect(mockRepos.updateAccountBalance).toHaveBeenCalledWith('acc_1', 1800000, expect.anything())
  })

  it('매도 삭제 시 잔액을 차감한다', async () => {
    mockRepos.findInvestmentTradeById.mockResolvedValue({
      id: 'trade_1', tradeType: 'sell', totalAmount: 1800000, netAmount: 1790000, accountId: 'acc_1',
    } as any)

    await deleteTradeService('trade_1')

    expect(mockRepos.updateAccountBalance).toHaveBeenCalledWith('acc_1', -1790000, expect.anything())
  })
})

describe('getInvestmentTradesService', () => {
  it('매매 기록 목록을 반환한다', async () => {
    mockRepos.findAllInvestmentTrades.mockResolvedValue([{ id: 'trade_1' }] as any)

    const result = await getInvestmentTradesService()
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(1)
    }
  })

  it('필터를 전달한다', async () => {
    mockRepos.findAllInvestmentTrades.mockResolvedValue([])

    await getInvestmentTradesService('asset_1', '2026-04-01', '2026-05-01')
    expect(mockRepos.findAllInvestmentTrades).toHaveBeenCalledWith('asset_1', '2026-04-01', '2026-05-01')
  })
})

describe('getAssetInvestmentSummaryService', () => {
  it('자산 투자 요약을 반환한다', async () => {
    mockRepos.findAssetById.mockResolvedValue(mockAsset as any)
    mockRepos.getAssetTradeSummary.mockResolvedValue({
      assetId: 'asset_1', assetName: 'ISA', totalBought: 5000000,
      totalSold: 3000000, totalDividend: 100000, totalQuantity: 20,
      avgBuyPrice: 50000, realizedGain: 200000, totalReturn: 4.0,
    })

    const result = await getAssetInvestmentSummaryService('asset_1')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.totalBought).toBe(5000000)
      expect(result.data.realizedGain).toBe(200000)
    }
  })

  it('자산이 없으면 에러를 반환한다', async () => {
    mockRepos.findAssetById.mockResolvedValue(null)

    const result = await getAssetInvestmentSummaryService('asset_none')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('ASSET_NOT_FOUND')
    }
  })

  it('기간 파라미터를 전달한다', async () => {
    mockRepos.findAssetById.mockResolvedValue(mockAsset as any)
    mockRepos.getAssetTradeSummary.mockResolvedValue({ assetId: 'asset_1' } as any)

    await getAssetInvestmentSummaryService('asset_1', '2026-04-01', '2026-05-01')
    expect(mockRepos.getAssetTradeSummary).toHaveBeenCalledWith('asset_1', '2026-04-01', '2026-05-01')
  })
})
