import { describe, it, expect } from 'vitest'
import { formatCurrency, formatDate, generateId } from '@/lib/utils'

describe('formatCurrency', () => {
  it('KRW 형식으로 포맷한다', () => {
    expect(formatCurrency(50000)).toBe('50,000')
  })

  it('0원을 포맷한다', () => {
    expect(formatCurrency(0)).toBe('0')
  })

  it('음수는 절대값으로 포맷한다', () => {
    expect(formatCurrency(-15000)).toBe('15,000')
  })

  it('큰 금액을 포맷한다', () => {
    expect(formatCurrency(1234567890)).toBe('1,234,567,890')
  })
})

describe('formatDate', () => {
  it('기본 형식은 yyyy-MM-dd이다', () => {
    const result = formatDate(new Date(2026, 3, 1)) // April 1, 2026
    expect(result).toBe('2026-04-01')
  })

  it('문자열 날짜를 파싱한다', () => {
    const result = formatDate('2026-04-01')
    expect(result).toBe('2026-04-01')
  })

  it('커스텀 형식을 지원한다', () => {
    const result = formatDate(new Date(2026, 3, 1), 'yyyy년 MM월 dd일')
    expect(result).toBe('2026년 04월 01일')
  })
})

describe('generateId', () => {
  it('문자열 ID를 생성한다', () => {
    const id = generateId()
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })

  it('고유한 ID를 생성한다', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()))
    expect(ids.size).toBe(100)
  })
})
