import { describe, it, expect } from 'vitest'
import { formatNumber, formatCompact, monthDateRange, yearDateRange } from '@/lib/utils'

describe('formatNumber', () => {
  it('양수를 포맷한다', () => {
    expect(formatNumber(50000)).toBe('50,000')
  })

  it('음수도 절대값으로 포맷한다', () => {
    expect(formatNumber(-15000)).toBe('15,000')
  })

  it('0을 포맷한다', () => {
    expect(formatNumber(0)).toBe('0')
  })
})

describe('formatCompact', () => {
  it('억 단위를 축약한다', () => {
    expect(formatCompact(150000000)).toBe('1.5억')
  })

  it('만 단위를 축약한다', () => {
    expect(formatCompact(5000000)).toBe('500만')
    expect(formatCompact(50000)).toBe('5만')
    expect(formatCompact(12300)).toBe('1.2만')
  })

  it('천 단위를 축약한다', () => {
    expect(formatCompact(5000)).toBe('5천')
    expect(formatCompact(3500)).toBe('3.5천')
  })

  it('천 미만은 그대로 표시한다', () => {
    expect(formatCompact(999)).toBe('999')
    expect(formatCompact(0)).toBe('0')
  })

  it('절대값을 사용한다', () => {
    expect(formatCompact(-50000)).toBe('5만')
  })
})

describe('monthDateRange', () => {
  it('일반 월의 범위를 반환한다', () => {
    const { start, end } = monthDateRange(2026, 4)
    expect(start).toBe('2026-04-01')
    expect(end).toBe('2026-05-01')
  })

  it('1월의 범위를 반환한다', () => {
    const { start, end } = monthDateRange(2026, 1)
    expect(start).toBe('2026-01-01')
    expect(end).toBe('2026-02-01')
  })

  it('12월은 다음해 1월이 된다', () => {
    const { start, end } = monthDateRange(2026, 12)
    expect(start).toBe('2026-12-01')
    expect(end).toBe('2027-01-01')
  })

  it('한자리 월도 zero-padding 된다', () => {
    const { start, end } = monthDateRange(2026, 3)
    expect(start).toBe('2026-03-01')
    expect(end).toBe('2026-04-01')
  })
})

describe('yearDateRange', () => {
  it('연간 범위를 반환한다', () => {
    const { start, end } = yearDateRange(2026)
    expect(start).toBe('2026-01-01')
    expect(end).toBe('2027-01-01')
  })

  it('다른 연도를 반환한다', () => {
    const { start, end } = yearDateRange(2025)
    expect(start).toBe('2025-01-01')
    expect(end).toBe('2026-01-01')
  })
})
