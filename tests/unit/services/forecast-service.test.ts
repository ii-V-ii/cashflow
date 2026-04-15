import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db/repositories', () => ({
  findAllForecastScenarios: vi.fn(),
  findForecastScenarioById: vi.fn(),
  createForecastScenario: vi.fn(),
  updateForecastScenario: vi.fn(),
  deleteForecastScenario: vi.fn(),
  findForecastResultsByScenarioId: vi.fn(),
  saveForecastResults: vi.fn(),
  findAllAccounts: vi.fn(),
  findAllAssets: vi.fn(),
  findAllAssetCategories: vi.fn(),
}))

vi.mock('@/lib/forecast/cashflow-forecast', () => ({
  projectCashflow: vi.fn(),
}))

vi.mock('@/lib/forecast/asset-forecast', () => ({
  projectAssetsFromList: vi.fn(),
}))

import {
  getForecastScenariosService,
  getForecastScenarioByIdService,
  createForecastScenarioService,
  updateForecastScenarioService,
  deleteForecastScenarioService,
  runForecastService,
  getForecastResultsService,
} from '@/lib/services/forecast-service'
import * as repos from '@/db/repositories'
import { projectCashflow } from '@/lib/forecast/cashflow-forecast'
import { projectAssetsFromList } from '@/lib/forecast/asset-forecast'

const mockRepos = vi.mocked(repos)
const mockProjectCashflow = vi.mocked(projectCashflow)
const mockProjectAssets = vi.mocked(projectAssetsFromList)

const mockScenario = {
  id: 'sc_1', name: '기본 시나리오', description: null,
  assumptions: { incomeGrowthRate: 3, expenseGrowthRate: 2 },
  startDate: '2026-05-01', endDate: '2026-07-01',
  createdAt: new Date(), updatedAt: new Date(),
}

describe('getForecastScenariosService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('시나리오 목록을 반환한다', async () => {
    mockRepos.findAllForecastScenarios.mockResolvedValue([mockScenario] as any)
    const result = await getForecastScenariosService()
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toHaveLength(1)
  })
})

describe('getForecastScenarioByIdService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('존재하는 시나리오를 반환한다', async () => {
    mockRepos.findForecastScenarioById.mockResolvedValue(mockScenario as any)
    const result = await getForecastScenarioByIdService('sc_1')
    expect(result.success).toBe(true)
  })

  it('존재하지 않으면 에러를 반환한다', async () => {
    mockRepos.findForecastScenarioById.mockResolvedValue(null)
    const result = await getForecastScenarioByIdService('none')
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND')
  })
})

describe('createForecastScenarioService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('유효한 시나리오를 생성한다', async () => {
    mockRepos.createForecastScenario.mockResolvedValue(mockScenario as any)
    const result = await createForecastScenarioService({
      name: '기본 시나리오', startDate: '2026-05-01', endDate: '2026-07-01',
    })
    expect(result.success).toBe(true)
  })

  it('유효성 검사 실패 시 에러를 반환한다', async () => {
    const result = await createForecastScenarioService({ name: '' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR')
  })
})

describe('updateForecastScenarioService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('시나리오를 수정한다', async () => {
    mockRepos.updateForecastScenario.mockResolvedValue(mockScenario as any)
    const result = await updateForecastScenarioService('sc_1', { name: '수정된 시나리오' })
    expect(result.success).toBe(true)
  })

  it('존재하지 않으면 에러를 반환한다', async () => {
    mockRepos.updateForecastScenario.mockResolvedValue(null)
    const result = await updateForecastScenarioService('none', { name: '수정' })
    expect(result.success).toBe(false)
  })
})

describe('deleteForecastScenarioService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('시나리오를 삭제한다', async () => {
    mockRepos.deleteForecastScenario.mockResolvedValue(true)
    const result = await deleteForecastScenarioService('sc_1')
    expect(result.success).toBe(true)
  })

  it('존재하지 않으면 에러를 반환한다', async () => {
    mockRepos.deleteForecastScenario.mockResolvedValue(false)
    const result = await deleteForecastScenarioService('none')
    expect(result.success).toBe(false)
  })
})

describe('runForecastService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('예측을 실행하고 결과를 저장한다', async () => {
    mockRepos.findForecastScenarioById.mockResolvedValue(mockScenario as any)
    mockRepos.findAllAccounts.mockResolvedValue([
      { id: 'acc_1', currentBalance: 5000000 },
    ] as any)
    mockRepos.findAllAssets.mockResolvedValue([])
    mockRepos.findAllAssetCategories.mockResolvedValue([])

    mockProjectCashflow.mockResolvedValue([
      { date: '2026-06-01', projectedIncome: 5000000, projectedExpense: 3000000, recurringIncome: 4000000, recurringExpense: 2000000, historicalIncome: 1000000, historicalExpense: 1000000 },
      { date: '2026-07-01', projectedIncome: 5150000, projectedExpense: 3060000, recurringIncome: 4000000, recurringExpense: 2000000, historicalIncome: 1150000, historicalExpense: 1060000 },
    ])
    mockProjectAssets.mockReturnValue({ totalProjectedValue: 0, projections: [] })

    const savedResults = [
      { id: 'r1', scenarioId: 'sc_1', date: '2026-06-01', projectedIncome: 5000000, projectedExpense: 3000000, projectedBalance: 7000000, projectedNetWorth: 7000000, details: null, createdAt: new Date(), updatedAt: new Date() },
      { id: 'r2', scenarioId: 'sc_1', date: '2026-07-01', projectedIncome: 5150000, projectedExpense: 3060000, projectedBalance: 9090000, projectedNetWorth: 9090000, details: null, createdAt: new Date(), updatedAt: new Date() },
    ]
    mockRepos.saveForecastResults.mockResolvedValue(savedResults as any)

    const result = await runForecastService({ scenarioId: 'sc_1' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.scenario.id).toBe('sc_1')
      expect(result.data.results).toHaveLength(2)
    }
    expect(mockProjectCashflow).toHaveBeenCalled()
    expect(mockRepos.saveForecastResults).toHaveBeenCalled()
  })

  it('시나리오가 없으면 에러를 반환한다', async () => {
    mockRepos.findForecastScenarioById.mockResolvedValue(null)
    const result = await runForecastService({ scenarioId: 'none' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND')
  })

  it('유효성 검사 실패 시 에러를 반환한다', async () => {
    const result = await runForecastService({ scenarioId: '' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR')
  })
})

describe('getForecastResultsService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('시나리오의 결과를 반환한다', async () => {
    mockRepos.findForecastScenarioById.mockResolvedValue(mockScenario as any)
    mockRepos.findForecastResultsByScenarioId.mockResolvedValue([
      { id: 'r1', scenarioId: 'sc_1', date: '2026-06-01', projectedIncome: 5000000, projectedExpense: 3000000, projectedBalance: 7000000, projectedNetWorth: 7000000, details: null, createdAt: new Date(), updatedAt: new Date() },
    ] as any)

    const result = await getForecastResultsService('sc_1')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.results).toHaveLength(1)
    }
  })

  it('시나리오가 없으면 에러를 반환한다', async () => {
    mockRepos.findForecastScenarioById.mockResolvedValue(null)
    const result = await getForecastResultsService('none')
    expect(result.success).toBe(false)
  })
})
