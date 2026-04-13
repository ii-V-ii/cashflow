import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock getDb to return a chainable query builder that is also thenable
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

import { getMonthlySettlement, getAnnualSettlement } from '@/lib/services/settlement-service'

describe('getMonthlySettlement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('데이터가 없으면 0으로 반환한다', async () => {
    // 1. getCategoryTotalsForMonth → db.execute
    mockExecute.mockResolvedValueOnce([])
    // 2. getAccountChangesForMonth:
    //    - db.select().from(accounts) → mockResolve
    mockResolve.mockResolvedValueOnce([])
    //    - db.execute (pre-month effects) → mockExecute
    mockExecute.mockResolvedValueOnce([])
    //    - db.execute (month effects) → mockExecute
    mockExecute.mockResolvedValueOnce([])
    // 3. getPreviousMonthTotals → getMonthTotals → query chain → mockResolve
    mockResolve.mockResolvedValueOnce([])

    const result = await getMonthlySettlement(2026, 4)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.year).toBe(2026)
      expect(result.data.month).toBe(4)
      expect(result.data.totalIncome).toBe(0)
      expect(result.data.totalExpense).toBe(0)
      expect(result.data.netIncome).toBe(0)
      expect(result.data.incomeByCategory).toEqual([])
      expect(result.data.expenseByCategory).toEqual([])
      expect(result.data.accountChanges).toEqual([])
      expect(result.data.previousMonth).toBeNull()
    }
  })

  it('수입/지출을 카테고리별로 집계한다', async () => {
    // 1. getCategoryTotalsForMonth → db.execute
    mockExecute.mockResolvedValueOnce([
      { category_id: 'cat_salary', category_name: '급여', type: 'income', amount: 5000000 },
      { category_id: 'cat_food', category_name: '식비', type: 'expense', amount: 300000 },
      { category_id: 'cat_transport', category_name: '교통', type: 'expense', amount: 100000 },
    ])
    // 2. getAccountChangesForMonth
    mockResolve.mockResolvedValueOnce([])    // accounts list
    mockExecute.mockResolvedValueOnce([])    // pre-month effects
    mockExecute.mockResolvedValueOnce([])    // month effects
    // 3. getPreviousMonthTotals → getMonthTotals
    mockResolve.mockResolvedValueOnce([])

    const result = await getMonthlySettlement(2026, 4)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.totalIncome).toBe(5000000)
      expect(result.data.totalExpense).toBe(400000)
      expect(result.data.netIncome).toBe(4600000)
      expect(result.data.incomeByCategory).toHaveLength(1)
      expect(result.data.expenseByCategory).toHaveLength(2)
    }
  })

  it('전월 대비 데이터를 포함한다', async () => {
    // 1. getCategoryTotalsForMonth → db.execute
    mockExecute.mockResolvedValueOnce([])
    // 2. getAccountChangesForMonth
    mockResolve.mockResolvedValueOnce([])    // accounts list
    mockExecute.mockResolvedValueOnce([])    // pre-month effects
    mockExecute.mockResolvedValueOnce([])    // month effects
    // 3. getPreviousMonthTotals → getMonthTotals (3월)
    mockResolve.mockResolvedValueOnce([
      { type: 'income', total: 4500000 },
      { type: 'expense', total: 350000 },
    ])

    const result = await getMonthlySettlement(2026, 4)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.previousMonth).not.toBeNull()
      expect(result.data.previousMonth!.totalIncome).toBe(4500000)
      expect(result.data.previousMonth!.totalExpense).toBe(350000)
      expect(result.data.previousMonth!.netIncome).toBe(4150000)
    }
  })

  it('1월이면 전월은 전년 12월이다', async () => {
    // 1. getCategoryTotalsForMonth → db.execute
    mockExecute.mockResolvedValueOnce([])
    // 2. getAccountChangesForMonth
    mockResolve.mockResolvedValueOnce([])    // accounts list
    mockExecute.mockResolvedValueOnce([])    // pre-month effects
    mockExecute.mockResolvedValueOnce([])    // month effects
    // 3. getPreviousMonthTotals → getMonthTotals (전년 12월)
    mockResolve.mockResolvedValueOnce([
      { type: 'income', total: 3000000 },
    ])

    const result = await getMonthlySettlement(2026, 1)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.previousMonth).not.toBeNull()
      expect(result.data.previousMonth!.totalIncome).toBe(3000000)
    }
  })

  it('계좌별 변동을 계산한다', async () => {
    // 1. getCategoryTotalsForMonth → db.execute
    mockExecute.mockResolvedValueOnce([])
    // 2. getAccountChangesForMonth:
    //    - accounts list (initialBalance 기반 순방향 계산)
    mockResolve.mockResolvedValueOnce([
      { id: 'acc_1', name: '신한', currentBalance: 5000000, initialBalance: 0 },
    ])
    //    - pre-month effects (단일 집계 쿼리)
    mockExecute.mockResolvedValueOnce([
      { account_id: 'acc_1', net_effect: 4200000 },
    ])
    //    - month effects (단일 집계 쿼리)
    mockExecute.mockResolvedValueOnce([
      { account_id: 'acc_1', income: 1000000, expense: 200000 },
    ])
    // 3. getPreviousMonthTotals → getMonthTotals
    mockResolve.mockResolvedValueOnce([])

    const result = await getMonthlySettlement(2026, 4)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.accountChanges).toHaveLength(1)
      const acc = result.data.accountChanges[0]
      expect(acc.accountName).toBe('신한')
      // openingBalance = initialBalance(0) + preEffect(4200000) = 4200000
      expect(acc.openingBalance).toBe(4200000)
      expect(acc.income).toBe(1000000)
      expect(acc.expense).toBe(200000)
      // closingBalance = 4200000 + 1000000 - 200000 = 5000000
      expect(acc.closingBalance).toBe(5000000)
    }
  })
})

describe('getAnnualSettlement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('12개월 집계를 반환한다', async () => {
    // 1. getMonthlyTotalsForYear → query builder chain → mockResolve
    mockResolve.mockResolvedValueOnce([
      { month: 1, type: 'income', total: 5000000 },
      { month: 1, type: 'expense', total: 300000 },
      { month: 3, type: 'income', total: 5000000 },
    ])
    // 2. getCategoryTotalsForYear → db.execute → mockExecute
    mockExecute.mockResolvedValueOnce([
      { category_id: 'cat_salary', category_name: '급여', type: 'income', amount: 10000000 },
      { category_id: 'cat_food', category_name: '식비', type: 'expense', amount: 300000 },
    ])
    // 3. getYearTotals → query builder chain → mockResolve
    mockResolve.mockResolvedValueOnce([])

    const result = await getAnnualSettlement(2026)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.year).toBe(2026)
      expect(result.data.months).toHaveLength(12)
      expect(result.data.totalIncome).toBe(10000000)
      expect(result.data.totalExpense).toBe(300000)
      expect(result.data.netIncome).toBe(9700000)

      // 1월 데이터 확인
      const jan = result.data.months[0]
      expect(jan.month).toBe(1)
      expect(jan.income).toBe(5000000)
      expect(jan.expense).toBe(300000)
      expect(jan.netIncome).toBe(4700000)

      // 데이터 없는 2월
      const feb = result.data.months[1]
      expect(feb.income).toBe(0)
      expect(feb.expense).toBe(0)
    }
  })

  it('전년 대비 데이터를 포함한다', async () => {
    // 1. getMonthlyTotalsForYear → mockResolve
    mockResolve.mockResolvedValueOnce([])
    // 2. getCategoryTotalsForYear → mockExecute
    mockExecute.mockResolvedValueOnce([])
    // 3. getYearTotals → mockResolve
    mockResolve.mockResolvedValueOnce([
      { type: 'income', total: 48000000 },
      { type: 'expense', total: 12000000 },
    ])

    const result = await getAnnualSettlement(2026)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.previousYear).not.toBeNull()
      expect(result.data.previousYear!.totalIncome).toBe(48000000)
      expect(result.data.previousYear!.netIncome).toBe(36000000)
    }
  })
})
