import { describe, it, expect } from 'vitest'
import {
  calculateSimpleReturn,
  calculateCAGR,
  calculatePortfolioWeight,
  calculateYearsHeld,
} from '@/lib/calculations/investment-calculator'

describe('calculateSimpleReturn', () => {
  it('양수 수익률을 계산한다', () => {
    // (150 - 100) / 100 * 100 = 50%
    expect(calculateSimpleReturn(150, 100)).toBe(50)
  })

  it('음수 수익률을 계산한다', () => {
    // (80 - 100) / 100 * 100 = -20%
    expect(calculateSimpleReturn(80, 100)).toBe(-20)
  })

  it('동일 가치면 0%이다', () => {
    expect(calculateSimpleReturn(100, 100)).toBe(0)
  })

  it('취득원가 0이면 0을 반환한다', () => {
    expect(calculateSimpleReturn(100, 0)).toBe(0)
  })

  it('실제 투자 시나리오를 계산한다', () => {
    // 1000만원 → 1250만원
    const result = calculateSimpleReturn(12500000, 10000000)
    expect(result).toBe(25)
  })
})

describe('calculateCAGR', () => {
  it('연환산 수익률을 계산한다', () => {
    // 100 → 200 in 3 years: (200/100)^(1/3) - 1 ≈ 26%
    const result = calculateCAGR(200, 100, 3)
    expect(result).toBeCloseTo(25.99, 1)
  })

  it('1년이면 단순 수익률과 동일하다', () => {
    const result = calculateCAGR(150, 100, 1)
    expect(result).toBe(50)
  })

  it('취득원가 0이면 0을 반환한다', () => {
    expect(calculateCAGR(150, 0, 3)).toBe(0)
  })

  it('년수 0이면 0을 반환한다', () => {
    expect(calculateCAGR(150, 100, 0)).toBe(0)
  })

  it('현재가치 0이면 0을 반환한다', () => {
    expect(calculateCAGR(0, 100, 3)).toBe(0)
  })

  it('음수 취득원가면 0을 반환한다', () => {
    expect(calculateCAGR(150, -100, 3)).toBe(0)
  })
})

describe('calculatePortfolioWeight', () => {
  it('비중을 계산한다', () => {
    // 300만 / 1000만 = 30%
    expect(calculatePortfolioWeight(3000000, 10000000)).toBe(30)
  })

  it('총 자산가치 0이면 0을 반환한다', () => {
    expect(calculatePortfolioWeight(3000000, 0)).toBe(0)
  })

  it('100% 비중을 계산한다', () => {
    expect(calculatePortfolioWeight(5000000, 5000000)).toBe(100)
  })

  it('소수점 비중을 계산한다', () => {
    const result = calculatePortfolioWeight(1000000, 3000000)
    expect(result).toBeCloseTo(33.33, 1)
  })
})

describe('calculateYearsHeld', () => {
  it('정확히 1년을 계산한다', () => {
    const result = calculateYearsHeld('2025-04-15', '2026-04-15')
    expect(result).toBeCloseTo(1.0, 1)
  })

  it('6개월을 계산한다', () => {
    const result = calculateYearsHeld('2026-01-01', '2026-07-01')
    expect(result).toBeCloseTo(0.5, 1)
  })

  it('2년을 계산한다', () => {
    const result = calculateYearsHeld('2024-04-15', '2026-04-15')
    expect(result).toBeCloseTo(2.0, 1)
  })

  it('같은 날이면 0이다', () => {
    const result = calculateYearsHeld('2026-04-15', '2026-04-15')
    expect(result).toBeCloseTo(0, 1)
  })
})
