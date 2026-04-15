import { describe, it, expect } from 'vitest'
import { createForecastScenarioSchema, updateForecastScenarioSchema, runForecastSchema } from '@/lib/validators/forecast'

const validScenario = {
  name: '기본 시나리오',
  startDate: '2026-05-01',
  endDate: '2027-05-01',
}

describe('createForecastScenarioSchema', () => {
  it('유효한 시나리오를 통과한다', () => {
    const result = createForecastScenarioSchema.safeParse(validScenario)
    expect(result.success).toBe(true)
  })

  it('가정치를 포함할 수 있다', () => {
    const result = createForecastScenarioSchema.safeParse({
      ...validScenario,
      assumptions: {
        incomeGrowthRate: 3,
        expenseGrowthRate: 2,
        inflationRate: 2.5,
        assetGrowthRates: { 금융자산: 5, 부동산: 3 },
      },
    })
    expect(result.success).toBe(true)
  })

  it('이름이 빈 문자열이면 실패한다', () => {
    const result = createForecastScenarioSchema.safeParse({ ...validScenario, name: '' })
    expect(result.success).toBe(false)
  })

  it('잘못된 시작일 형식이면 실패한다', () => {
    const result = createForecastScenarioSchema.safeParse({ ...validScenario, startDate: '2026/05/01' })
    expect(result.success).toBe(false)
  })

  it('잘못된 종료일 형식이면 실패한다', () => {
    const result = createForecastScenarioSchema.safeParse({ ...validScenario, endDate: 'invalid' })
    expect(result.success).toBe(false)
  })

  it('기본값이 올바르게 설정된다', () => {
    const result = createForecastScenarioSchema.safeParse(validScenario)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.description).toBeNull()
      expect(result.data.assumptions).toBeNull()
    }
  })

  it('증가율 범위를 검증한다', () => {
    const result = createForecastScenarioSchema.safeParse({
      ...validScenario,
      assumptions: { incomeGrowthRate: 1001 },
    })
    expect(result.success).toBe(false)
  })

  it('음수 증가율을 허용한다', () => {
    const result = createForecastScenarioSchema.safeParse({
      ...validScenario,
      assumptions: { incomeGrowthRate: -50 },
    })
    expect(result.success).toBe(true)
  })
})

describe('updateForecastScenarioSchema', () => {
  it('부분 업데이트를 허용한다', () => {
    const result = updateForecastScenarioSchema.safeParse({ name: '수정' })
    expect(result.success).toBe(true)
  })

  it('빈 객체를 허용한다', () => {
    const result = updateForecastScenarioSchema.safeParse({})
    expect(result.success).toBe(true)
  })
})

describe('runForecastSchema', () => {
  it('유효한 실행 요청을 통과한다', () => {
    const result = runForecastSchema.safeParse({ scenarioId: 'sc_1' })
    expect(result.success).toBe(true)
  })

  it('scenarioId가 빈 문자열이면 실패한다', () => {
    const result = runForecastSchema.safeParse({ scenarioId: '' })
    expect(result.success).toBe(false)
  })

  it('scenarioId가 없으면 실패한다', () => {
    const result = runForecastSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})
