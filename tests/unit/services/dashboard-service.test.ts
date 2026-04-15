import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockResolve = vi.fn()
const mockExecute = vi.fn()

function createChain() {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'from', 'where', 'groupBy', 'orderBy']
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
    return mockResolve().then(resolve, reject)
  }
  return chain
}

const mockDbChain = createChain()

vi.mock('@/db/index', () => ({
  getDb: vi.fn(() => {
    const db = mockDbChain
    ;(db as Record<string, unknown>).execute = mockExecute
    return db
  }),
}))

vi.mock('@/db/schema', () => ({
  transactions: { date: 'date', type: 'type', amount: 'amount', status: 'status' },
}))

vi.mock('drizzle-orm', () => {
  const makeSql = (..._args: unknown[]) => ({ as: vi.fn().mockReturnValue('sql_col') })
  makeSql.raw = vi.fn()
  return {
    and: vi.fn((...args: unknown[]) => args),
    eq: vi.fn((a: unknown, b: unknown) => [a, b]),
    sql: makeSql,
    gte: vi.fn((a: unknown, b: unknown) => [a, b]),
    lt: vi.fn((a: unknown, b: unknown) => [a, b]),
  }
})

import { getDailyTotals } from '@/lib/services/dashboard-service'

describe('getDailyTotals', () => {
  beforeEach(() => vi.clearAllMocks())

  it('일별 수입/지출 합계를 반환한다', async () => {
    mockExecute.mockResolvedValueOnce([
      { date: '2026-04-01', income: 5000000, expense: 150000 },
      { date: '2026-04-03', income: 0, expense: 32000 },
      { date: '2026-04-15', income: 0, expense: 85000 },
    ])

    const result = await getDailyTotals(2026, 4)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(3)
      expect(result.data[0].date).toBe('2026-04-01')
      expect(result.data[0].income).toBe(5000000)
      expect(result.data[0].expense).toBe(150000)
    }
  })

  it('거래가 없으면 빈 배열을 반환한다', async () => {
    mockExecute.mockResolvedValueOnce([])

    const result = await getDailyTotals(2026, 4)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(0)
    }
  })
})
