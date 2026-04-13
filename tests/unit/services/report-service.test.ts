import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockResolve = vi.fn()
const mockExecute = vi.fn()

function createChain() {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'from', 'where', 'groupBy', 'orderBy', 'leftJoin', 'innerJoin', 'limit', 'offset']
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  // Make the chain thenable so `await db.select().from()...` resolves via mockResolve
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
  transactions: { date: 'date', type: 'type', amount: 'amount', categoryId: 'categoryId', accountId: 'accountId', toAccountId: 'toAccountId' },
  categories: { id: 'id', name: 'name', type: 'type' },
  accounts: { id: 'id', name: 'name', currentBalance: 'currentBalance', initialBalance: 'initialBalance' },
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

import {
  getIncomeExpenseTrend,
  getCategoryAnalysis,
  getNetWorthTrend,
} from '@/lib/services/report-service'

describe('getIncomeExpenseTrend', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('기간별 월 단위 추이를 반환한다', async () => {
    mockResolve.mockResolvedValueOnce([
      { yearMonth: '2026-01', type: 'income', total: 5000000 },
      { yearMonth: '2026-01', type: 'expense', total: 300000 },
      { yearMonth: '2026-03', type: 'income', total: 4500000 },
    ])

    const result = await getIncomeExpenseTrend('2026-01', '2026-03')

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(3)

      expect(result.data[0].yearMonth).toBe('2026-01')
      expect(result.data[0].income).toBe(5000000)
      expect(result.data[0].expense).toBe(300000)
      expect(result.data[0].netIncome).toBe(4700000)

      // 2월에는 데이터 없음
      expect(result.data[1].yearMonth).toBe('2026-02')
      expect(result.data[1].income).toBe(0)
      expect(result.data[1].expense).toBe(0)

      expect(result.data[2].yearMonth).toBe('2026-03')
      expect(result.data[2].income).toBe(4500000)
    }
  })

  it('빈 기간에는 0으로 채운다', async () => {
    mockResolve.mockResolvedValueOnce([])

    const result = await getIncomeExpenseTrend('2026-01', '2026-01')

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(1)
      expect(result.data[0].income).toBe(0)
      expect(result.data[0].expense).toBe(0)
    }
  })

  it('연도를 넘는 범위도 처리한다', async () => {
    mockResolve.mockResolvedValueOnce([])

    const result = await getIncomeExpenseTrend('2025-11', '2026-02')

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(4)
      expect(result.data[0].yearMonth).toBe('2025-11')
      expect(result.data[1].yearMonth).toBe('2025-12')
      expect(result.data[2].yearMonth).toBe('2026-01')
      expect(result.data[3].yearMonth).toBe('2026-02')
    }
  })
})

describe('getCategoryAnalysis', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('카테고리별 지출 비율과 순위를 반환한다', async () => {
    // db.execute → raw SQL 결과 (snake_case 컬럼명)
    mockExecute.mockResolvedValueOnce([
      { category_id: 'cat_food', category_name: '식비', amount: 500000 },
      { category_id: 'cat_transport', category_name: '교통', amount: 200000 },
      { category_id: 'cat_ent', category_name: '여가', amount: 100000 },
    ])

    const result = await getCategoryAnalysis(2026, 4)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.year).toBe(2026)
      expect(result.data.month).toBe(4)
      expect(result.data.totalExpense).toBe(800000)
      expect(result.data.items).toHaveLength(3)

      // 1위 식비
      expect(result.data.items[0].rank).toBe(1)
      expect(result.data.items[0].categoryName).toBe('식비')
      expect(result.data.items[0].ratio).toBe(62.5)

      // 2위 교통
      expect(result.data.items[1].rank).toBe(2)
      expect(result.data.items[1].ratio).toBe(25)

      // 3위 여가
      expect(result.data.items[2].rank).toBe(3)
      expect(result.data.items[2].ratio).toBe(12.5)
    }
  })

  it('지출이 없으면 빈 결과를 반환한다', async () => {
    mockExecute.mockResolvedValueOnce([])

    const result = await getCategoryAnalysis(2026, 4)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.totalExpense).toBe(0)
      expect(result.data.items).toHaveLength(0)
    }
  })
})

describe('getNetWorthTrend', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 3, 13)) // 2026-04-13
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('최근 N개월 순자산 추이를 반환한다', async () => {
    // H-3: 단일 쿼리 + 누적합 방식
    // 계좌 목록 (initialBalance 기반)
    mockResolve.mockResolvedValueOnce([
      { id: 'acc_1', name: '신한', currentBalance: 10000000, initialBalance: 13000000 },
      { id: 'acc_2', name: '국민', currentBalance: 5000000, initialBalance: 500000 },
    ])
    // totalInitialBalance = 13500000

    // 단일 쿼리: 월별 순효과 (db.execute)
    // monthList = ['2026-02', '2026-03', '2026-04']
    mockExecute.mockResolvedValueOnce([
      { year_month: '2026-03', net_effect: 700000 },
      { year_month: '2026-04', net_effect: 800000 },
      // 2026-02에는 거래 없음 → 잔액 유지
    ])

    const result = await getNetWorthTrend(3)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(3)
      // 2026-02: initialBalance(13500000) + 0 = 13500000
      expect(result.data[0].totalBalance).toBe(13500000)
      // 2026-03: 13500000 + 700000 = 14200000
      expect(result.data[1].totalBalance).toBe(14200000)
      // 2026-04: 14200000 + 800000 = 15000000
      expect(result.data[2].totalBalance).toBe(15000000)
    }
  })
})
