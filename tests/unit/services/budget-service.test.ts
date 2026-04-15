import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db/repositories', () => ({
  findAllBudgets: vi.fn(),
  findBudgetById: vi.fn(),
  findBudgetByYearMonth: vi.fn(),
  findAllCategories: vi.fn(),
  findBudgetsWithItemsByYear: vi.fn(),
  upsertBudgetItem: vi.fn(),
  createBudget: vi.fn(),
  updateBudget: vi.fn(),
  deleteBudget: vi.fn(),
  getBudgetItemsWithActuals: vi.fn(),
  getBudgetItems: vi.fn(),
  getMonthlyActuals: vi.fn(),
}))

import {
  createBudgetService,
  getBudgetByIdService,
  getBudgetsService,
  updateBudgetService,
  deleteBudgetService,
  getBudgetWithActualsService,
  copyBudgetFromPreviousMonthService,
  getAnnualBudgetSummaryService,
} from '@/lib/services/budget-service'
import * as repos from '@/db/repositories'

const mockRepos = vi.mocked(repos)

const mockBudget = {
  id: 'budget_1', name: '4월 예산', year: 2026, month: 4,
  totalIncome: 5000000, totalExpense: 3000000, memo: null,
  createdAt: new Date(), updatedAt: new Date(),
}

describe('createBudgetService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('유효한 예산을 생성한다', async () => {
    mockRepos.findBudgetByYearMonth.mockResolvedValue(null)
    mockRepos.createBudget.mockResolvedValue(mockBudget)

    const result = await createBudgetService({ name: '4월 예산', year: 2026, month: 4 })
    expect(result.success).toBe(true)
  })

  it('중복 예산이면 에러를 반환한다', async () => {
    mockRepos.findBudgetByYearMonth.mockResolvedValue(mockBudget)

    const result = await createBudgetService({ name: '4월 예산', year: 2026, month: 4 })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.code).toBe('DUPLICATE')
  })

  it('유효성 검사 실패 시 에러를 반환한다', async () => {
    const result = await createBudgetService({ name: '', year: 2026 })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR')
  })
})

describe('getBudgetByIdService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('존재하는 예산을 반환한다', async () => {
    mockRepos.findBudgetById.mockResolvedValue(mockBudget)
    const result = await getBudgetByIdService('budget_1')
    expect(result.success).toBe(true)
  })

  it('존재하지 않으면 에러를 반환한다', async () => {
    mockRepos.findBudgetById.mockResolvedValue(null)
    const result = await getBudgetByIdService('none')
    expect(result.success).toBe(false)
  })
})

describe('updateBudgetService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('예산을 수정한다', async () => {
    mockRepos.updateBudget.mockResolvedValue(mockBudget)
    const result = await updateBudgetService('budget_1', { name: '수정' })
    expect(result.success).toBe(true)
  })

  it('존재하지 않으면 에러를 반환한다', async () => {
    mockRepos.updateBudget.mockResolvedValue(null)
    const result = await updateBudgetService('none', { name: '수정' })
    expect(result.success).toBe(false)
  })
})

describe('deleteBudgetService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('예산을 삭제한다', async () => {
    mockRepos.deleteBudget.mockResolvedValue(true)
    const result = await deleteBudgetService('budget_1')
    expect(result.success).toBe(true)
  })

  it('존재하지 않으면 에러를 반환한다', async () => {
    mockRepos.deleteBudget.mockResolvedValue(false)
    const result = await deleteBudgetService('none')
    expect(result.success).toBe(false)
  })
})

describe('getBudgetWithActualsService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('예산 실적 대비를 반환한다', async () => {
    mockRepos.findBudgetById.mockResolvedValue(mockBudget)
    mockRepos.getBudgetItemsWithActuals.mockResolvedValue([
      { id: 'item_1', budgetId: 'budget_1', categoryId: 'cat_1', plannedAmount: 500000,
        memo: null, createdAt: new Date(), updatedAt: new Date(),
        categoryName: '식비', categoryType: 'expense', categoryParentId: null,
        actualAmount: 450000, difference: 50000, achievementRate: 90 },
    ])

    const result = await getBudgetWithActualsService('budget_1')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.items).toHaveLength(1)
      expect(result.data.items[0].achievementRate).toBe(90)
    }
  })

  it('연간 예산은 실적 대비 불가하다', async () => {
    mockRepos.findBudgetById.mockResolvedValue({ ...mockBudget, month: null })
    const result = await getBudgetWithActualsService('budget_1')
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.code).toBe('INVALID_REQUEST')
  })
})

describe('copyBudgetFromPreviousMonthService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('이전 월 예산을 복사한다', async () => {
    mockRepos.findBudgetByYearMonth
      .mockResolvedValueOnce(mockBudget)  // source 존재
      .mockResolvedValueOnce(null)         // target 미존재
    mockRepos.getBudgetItems.mockResolvedValue([
      { id: 'item_1', budgetId: 'budget_1', categoryId: 'cat_1', plannedAmount: 500000, memo: null, createdAt: new Date(), updatedAt: new Date() },
    ])
    mockRepos.createBudget.mockResolvedValue({ ...mockBudget, id: 'budget_2', month: 5 })

    const result = await copyBudgetFromPreviousMonthService({
      sourceYear: 2026, sourceMonth: 4, targetYear: 2026, targetMonth: 5,
    })
    expect(result.success).toBe(true)
    expect(mockRepos.createBudget).toHaveBeenCalledWith(expect.objectContaining({
      year: 2026, month: 5,
    }))
  })

  it('원본 예산이 없으면 에러를 반환한다', async () => {
    mockRepos.findBudgetByYearMonth.mockResolvedValue(null)
    const result = await copyBudgetFromPreviousMonthService({
      sourceYear: 2026, sourceMonth: 3, targetYear: 2026, targetMonth: 4,
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND')
  })

  it('대상 예산이 이미 존재하면 에러를 반환한다', async () => {
    mockRepos.findBudgetByYearMonth
      .mockResolvedValueOnce(mockBudget)
      .mockResolvedValueOnce(mockBudget)
    const result = await copyBudgetFromPreviousMonthService({
      sourceYear: 2026, sourceMonth: 3, targetYear: 2026, targetMonth: 4,
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.code).toBe('DUPLICATE')
  })
})

describe('getAnnualBudgetSummaryService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('12개월 예산/실적 요약을 반환한다', async () => {
    mockRepos.findAllBudgets.mockResolvedValue([
      { ...mockBudget, month: 1, totalIncome: 5000000, totalExpense: 3000000 },
      { ...mockBudget, month: 4, totalIncome: 5500000, totalExpense: 3200000 },
    ])
    mockRepos.getMonthlyActuals.mockResolvedValue([
      { month: 1, type: 'income', total: 5100000 },
      { month: 1, type: 'expense', total: 2800000 },
      { month: 4, type: 'expense', total: 3500000 },
    ])

    const result = await getAnnualBudgetSummaryService(2026)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.year).toBe(2026)
      expect(result.data.months).toHaveLength(12)

      const jan = result.data.months[0]
      expect(jan.plannedIncome).toBe(5000000)
      expect(jan.actualIncome).toBe(5100000)
      expect(jan.actualExpense).toBe(2800000)

      // 예산 없는 2월
      const feb = result.data.months[1]
      expect(feb.plannedIncome).toBe(0)
      expect(feb.actualIncome).toBe(0)

      expect(result.data.totalPlannedIncome).toBe(10500000)
      expect(result.data.totalActualIncome).toBe(5100000)
    }
  })
})
