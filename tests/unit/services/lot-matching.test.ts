import { describe, it, expect, vi, beforeEach } from 'vitest'
import { matchSellToLots, reverseLotMatching } from '@/db/repositories/investment-trade-repository'

// Mock getDb
const mockUpdate = vi.fn().mockReturnValue({
  set: vi.fn().mockReturnValue({ where: vi.fn() }),
})
const mockSelect = vi.fn()

vi.mock('@/db', () => ({
  getDb: vi.fn(() => ({
    select: mockSelect,
    update: mockUpdate,
  })),
}))

vi.mock('@/db/schema', () => ({
  investmentTrades: {
    id: 'id', assetId: 'asset_id', ticker: 'ticker', tradeType: 'trade_type',
    remainingQuantity: 'remaining_quantity', date: 'date', createdAt: 'created_at',
    unitPrice: 'unit_price', quantity: 'quantity',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ eq: [a, b] })),
  and: vi.fn((...args) => ({ and: args })),
  gt: vi.fn((a, b) => ({ gt: [a, b] })),
  asc: vi.fn((a) => ({ asc: a })),
  desc: vi.fn((a) => ({ desc: a })),
  sql: Object.assign((...args: unknown[]) => ({ sql: args }), { raw: vi.fn() }),
}))

describe('matchSellToLots', () => {
  beforeEach(() => vi.clearAllMocks())

  it('단일 로트에서 부분 매도한다', async () => {
    const mockTx = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([
              { id: 'buy1', unitPrice: 100000, remainingQuantity: 10 },
            ]),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn() }),
      }),
    }

    const result = await matchSellToLots('asset1', '삼성전자', 3, 110000, mockTx)

    expect(result.realizedGain).toBe(30000) // 3 × (110000 - 100000)
    expect(result.matchedLots).toHaveLength(1)
    expect(result.matchedLots[0].quantity).toBe(3)
    expect(mockTx.update).toHaveBeenCalledTimes(1) // buy1 remaining 10→7
  })

  it('여러 로트에 걸쳐 매도한다', async () => {
    const mockTx = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([
              { id: 'buy1', unitPrice: 100000, remainingQuantity: 5 },
              { id: 'buy2', unitPrice: 120000, remainingQuantity: 10 },
            ]),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn() }),
      }),
    }

    const result = await matchSellToLots('asset1', '삼성전자', 8, 110000, mockTx)

    // buy1: 5주 × (110000-100000) = 50000
    // buy2: 3주 × (110000-120000) = -30000
    expect(result.realizedGain).toBe(20000)
    expect(result.matchedLots).toHaveLength(2)
    expect(result.matchedLots[0]).toEqual({ buyTradeId: 'buy1', quantity: 5, costPerUnit: 100000 })
    expect(result.matchedLots[1]).toEqual({ buyTradeId: 'buy2', quantity: 3, costPerUnit: 120000 })
    expect(mockTx.update).toHaveBeenCalledTimes(2)
  })

  it('로트가 부족하면 에러를 던진다', async () => {
    const mockTx = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([
              { id: 'buy1', unitPrice: 100000, remainingQuantity: 3 },
            ]),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn() }),
      }),
    }

    await expect(matchSellToLots('asset1', '삼성전자', 10, 110000, mockTx))
      .rejects.toThrow('보유수량 부족')
  })
})

describe('reverseLotMatching', () => {
  beforeEach(() => vi.clearAllMocks())

  it('매도 삭제 시 로트를 복원한다', async () => {
    const mockTx = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([
              { id: 'buy2', unitPrice: 120000, quantity: 10, remainingQuantity: 7 },
              { id: 'buy1', unitPrice: 100000, quantity: 5, remainingQuantity: 0 },
            ]),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn() }),
      }),
    }

    // 8주 매도 삭제 → buy2에 3주, buy1에 5주 복원
    await reverseLotMatching('asset1', '삼성전자', 8, mockTx)

    expect(mockTx.update).toHaveBeenCalledTimes(2)
  })
})
