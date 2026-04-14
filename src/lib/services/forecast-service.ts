import {
  findAllForecastScenarios,
  findForecastScenarioById,
  createForecastScenario,
  updateForecastScenario,
  deleteForecastScenario,
  findForecastResultsByScenarioId,
  saveForecastResults,
  findAllAccounts,
  findAllAssets,
  findAllAssetCategories,
} from '@/db/repositories'
import {
  createForecastScenarioSchema,
  updateForecastScenarioSchema,
  runForecastSchema,
} from '@/lib/validators'
import { projectCashflow } from '@/lib/forecast/cashflow-forecast'
import { projectAssetsFromList } from '@/lib/forecast/asset-forecast'
import { successResponse, errorResponse } from '@/lib/api-response'
import type { ApiResponse, ForecastAssumptions, ForecastSummary } from '@/types'

// === Scenario CRUD ===

export async function getForecastScenariosService(): Promise<ApiResponse<
  Awaited<ReturnType<typeof findAllForecastScenarios>>
>> {
  return successResponse(await findAllForecastScenarios())
}

export async function getForecastScenarioByIdService(
  id: string,
): Promise<ApiResponse<Awaited<ReturnType<typeof findForecastScenarioById>>>> {
  const scenario = await findForecastScenarioById(id)
  if (!scenario) {
    return errorResponse('NOT_FOUND', '예측 시나리오를 찾을 수 없습니다')
  }
  return successResponse(scenario)
}

export async function createForecastScenarioService(
  input: unknown,
): Promise<ApiResponse<Awaited<ReturnType<typeof findForecastScenarioById>>>> {
  const parsed = createForecastScenarioSchema.safeParse(input)
  if (!parsed.success) {
    return errorResponse(
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다',
    )
  }
  const scenario = await createForecastScenario(parsed.data)
  return successResponse(scenario)
}

export async function updateForecastScenarioService(
  id: string,
  input: unknown,
): Promise<ApiResponse<Awaited<ReturnType<typeof findForecastScenarioById>>>> {
  const parsed = updateForecastScenarioSchema.safeParse(input)
  if (!parsed.success) {
    return errorResponse(
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다',
    )
  }
  const scenario = await updateForecastScenario(id, parsed.data)
  if (!scenario) {
    return errorResponse('NOT_FOUND', '예측 시나리오를 찾을 수 없습니다')
  }
  return successResponse(scenario)
}

export async function deleteForecastScenarioService(
  id: string,
): Promise<ApiResponse<{ deleted: true }>> {
  const deleted = await deleteForecastScenario(id)
  if (!deleted) {
    return errorResponse('NOT_FOUND', '예측 시나리오를 찾을 수 없습니다')
  }
  return successResponse({ deleted: true })
}

// === Forecast Execution ===

export async function runForecastService(
  input: unknown,
): Promise<ApiResponse<ForecastSummary>> {
  const parsed = runForecastSchema.safeParse(input)
  if (!parsed.success) {
    return errorResponse(
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다',
    )
  }

  const scenario = await findForecastScenarioById(parsed.data.scenarioId)
  if (!scenario) {
    return errorResponse('NOT_FOUND', '예측 시나리오를 찾을 수 없습니다')
  }

  const assumptions: ForecastAssumptions | null = (scenario.assumptions as ForecastAssumptions) ?? null

  // 캐시플로우 예측
  const cashflowProjections = await projectCashflow(
    scenario.startDate,
    scenario.endDate,
    assumptions,
  )

  // 현재 계좌 잔액 합계
  const allAccounts = await findAllAccounts()
  const currentTotalBalance = allAccounts.reduce(
    (sum, a) => sum + a.currentBalance,
    0,
  )

  // M-10: 자산 목록과 카테고리를 루프 밖에서 한번 조회
  const activeAssets = await findAllAssets(true)
  const allAssetCategories = await findAllAssetCategories()
  const categoryMap = new Map(allAssetCategories.map(c => [c.id, c.name]))

  // 결과 생성 (누적 잔액 + 자산 투영) - 순차 처리로 cumulativeBalance 정합성 보장
  let cumulativeBalance = currentTotalBalance
  const resultRows = cashflowProjections.map((proj, index) => {
    const netFlow = proj.projectedIncome - proj.projectedExpense
    cumulativeBalance += netFlow

    const monthsFromStart = index + 1
    const { totalProjectedValue, projections: assetProjections } = projectAssetsFromList(
      activeAssets,
      monthsFromStart,
      assumptions,
      categoryMap,
    )

    const projectedNetWorth = cumulativeBalance + totalProjectedValue

    return {
      date: proj.date,
      projectedIncome: proj.projectedIncome,
      projectedExpense: proj.projectedExpense,
      projectedBalance: cumulativeBalance,
      projectedNetWorth,
      details: {
        recurringIncome: proj.recurringIncome,
        recurringExpense: proj.recurringExpense,
        historicalIncome: proj.historicalIncome,
        historicalExpense: proj.historicalExpense,
        assetProjections,
      },
    }
  })

  // 결과 저장 (RETURNING으로 저장된 행 직접 반환)
  const savedResults = await saveForecastResults(scenario.id, resultRows)

  return successResponse({
    scenario: { ...scenario, assumptions },
    results: savedResults.map((r) => ({
      ...r,
      details: r.details as ForecastSummary['results'][number]['details'],
    })),
  })
}

// === Results ===

export async function getForecastResultsService(
  scenarioId: string,
): Promise<ApiResponse<ForecastSummary>> {
  const scenario = await findForecastScenarioById(scenarioId)
  if (!scenario) {
    return errorResponse('NOT_FOUND', '예측 시나리오를 찾을 수 없습니다')
  }

  const results = await findForecastResultsByScenarioId(scenarioId)

  return successResponse({
    scenario: {
      ...scenario,
      assumptions: (scenario.assumptions as ForecastAssumptions) ?? null,
    },
    results: results.map((r) => ({
      ...r,
      details: r.details as ForecastSummary['results'][number]['details'],
    })),
  })
}
