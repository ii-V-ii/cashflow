import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  calculateLumpSumDeposit,
  calculateInstallmentSavings,
  calculateMaturityDate,
  calculateDaysUntilMaturity,
} from '@/lib/calculations/deposit-calculator'

describe('calculateLumpSumDeposit', () => {
  it('일반과세 예금 이자를 계산한다', () => {
    // 1000만원, 연 3.5%, 12개월, 일반과세(15.4%)
    const result = calculateLumpSumDeposit(10000000, 3.5, 12, 'normal')

    expect(result.interest).toBe(350000)
    expect(result.tax).toBe(53900) // 350000 * 0.154
    expect(result.afterTaxInterest).toBe(296100)
    expect(result.totalAtMaturity).toBe(10296100)
  })

  it('비과세 예금은 세금이 0이다', () => {
    const result = calculateLumpSumDeposit(10000000, 3.5, 12, 'tax_free')

    expect(result.tax).toBe(0)
    expect(result.afterTaxInterest).toBe(350000)
    expect(result.totalAtMaturity).toBe(10350000)
  })

  it('세금우대(9.5%) 예금을 계산한다', () => {
    const result = calculateLumpSumDeposit(10000000, 3.5, 12, 'preferential')

    expect(result.tax).toBe(33250) // 350000 * 0.095
    expect(result.afterTaxInterest).toBe(316750)
  })

  it('고율과세(27.5%) 예금을 계산한다', () => {
    const result = calculateLumpSumDeposit(10000000, 3.5, 12, 'high')

    expect(result.tax).toBe(96250) // 350000 * 0.275
  })

  it('6개월 단기 예금을 계산한다', () => {
    const result = calculateLumpSumDeposit(10000000, 3.5, 6, 'normal')

    expect(result.interest).toBe(175000) // 10000000 * 0.035 * 0.5
  })

  it('원금 0이면 이자도 0이다', () => {
    const result = calculateLumpSumDeposit(0, 3.5, 12, 'normal')

    expect(result.interest).toBe(0)
    expect(result.totalAtMaturity).toBe(0)
  })

  it('이율 0이면 이자도 0이다', () => {
    const result = calculateLumpSumDeposit(10000000, 0, 12, 'normal')

    expect(result.interest).toBe(0)
    expect(result.totalAtMaturity).toBe(10000000)
  })
})

describe('calculateInstallmentSavings', () => {
  it('월 50만원, 연 4%, 12개월 적금을 계산한다', () => {
    // 이자 = 500000 * (0.04/12) * (12*13/2) = 500000 * 0.003333 * 78
    const result = calculateInstallmentSavings(500000, 4, 12, 'normal')

    expect(result.totalPaid).toBe(6000000)
    expect(result.interest).toBe(130000) // 반올림
    expect(result.tax).toBe(20020) // 130000 * 0.154
    expect(result.afterTaxInterest).toBe(109980)
    expect(result.totalAtMaturity).toBe(6109980)
  })

  it('비과세 적금은 세금이 0이다', () => {
    const result = calculateInstallmentSavings(500000, 4, 12, 'tax_free')

    expect(result.tax).toBe(0)
    expect(result.afterTaxInterest).toBe(result.interest)
  })

  it('납입액 0이면 이자도 0이다', () => {
    const result = calculateInstallmentSavings(0, 4, 12, 'normal')

    expect(result.totalPaid).toBe(0)
    expect(result.interest).toBe(0)
    expect(result.totalAtMaturity).toBe(0)
  })

  it('24개월 적금을 계산한다', () => {
    const result = calculateInstallmentSavings(300000, 3.5, 24, 'normal')

    expect(result.totalPaid).toBe(7200000)
    expect(result.interest).toBeGreaterThan(0)
    expect(result.totalAtMaturity).toBeGreaterThan(result.totalPaid)
  })
})

describe('calculateMaturityDate', () => {
  it('12개월 후 만기일을 계산한다', () => {
    expect(calculateMaturityDate('2026-01-15', 12)).toBe('2027-01-15')
  })

  it('6개월 후 만기일을 계산한다', () => {
    expect(calculateMaturityDate('2026-04-01', 6)).toBe('2026-10-01')
  })

  it('연도를 넘는 만기일을 계산한다', () => {
    expect(calculateMaturityDate('2026-11-01', 3)).toBe('2027-02-01')
  })

  it('24개월 만기를 계산한다', () => {
    expect(calculateMaturityDate('2025-06-01', 24)).toBe('2027-06-01')
  })
})

describe('calculateDaysUntilMaturity', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 3, 15)) // 2026-04-15
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('미래 만기일까지 남은 일수를 계산한다', () => {
    const days = calculateDaysUntilMaturity('2026-05-15')
    expect(days).toBe(30)
  })

  it('오늘이 만기일이면 0이다', () => {
    const days = calculateDaysUntilMaturity('2026-04-15')
    expect(days).toBe(0)
  })

  it('과거 만기일이면 음수이다', () => {
    const days = calculateDaysUntilMaturity('2026-04-10')
    expect(days).toBe(-5)
  })
})
