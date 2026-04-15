import { describe, it, expect } from 'vitest'
import { createInvestmentTradeSchema, updateInvestmentTradeSchema } from '@/lib/validators/investment-trade'

const validTrade = {
  assetId: 'asset_1',
  tradeType: 'buy' as const,
  date: '2026-04-15',
  ticker: '삼성전자',
  quantity: 10,
  unitPrice: 180000,
  totalAmount: 1800000,
  fee: 0,
  tax: 0,
  netAmount: 1800000,
  accountId: 'acc_1',
}

describe('createInvestmentTradeSchema', () => {
  it('유효한 매수를 통과한다', () => {
    const result = createInvestmentTradeSchema.safeParse(validTrade)
    expect(result.success).toBe(true)
  })

  it('유효한 매도를 통과한다', () => {
    const result = createInvestmentTradeSchema.safeParse({
      ...validTrade,
      tradeType: 'sell',
      netAmount: 1790000,
      fee: 5000,
      tax: 5000,
    })
    expect(result.success).toBe(true)
  })

  it('유효한 배당을 통과한다', () => {
    const result = createInvestmentTradeSchema.safeParse({
      ...validTrade,
      tradeType: 'dividend',
      quantity: 10,
      unitPrice: 0,
      totalAmount: 50000,
      netAmount: 42300,
      tax: 7700,
    })
    expect(result.success).toBe(true)
  })

  it('assetId 빈 문자열이면 실패한다', () => {
    const result = createInvestmentTradeSchema.safeParse({ ...validTrade, assetId: '' })
    expect(result.success).toBe(false)
  })

  it('잘못된 tradeType이면 실패한다', () => {
    const result = createInvestmentTradeSchema.safeParse({ ...validTrade, tradeType: 'swap' })
    expect(result.success).toBe(false)
  })

  it('잘못된 날짜 형식이면 실패한다', () => {
    const result = createInvestmentTradeSchema.safeParse({ ...validTrade, date: '2026/04/15' })
    expect(result.success).toBe(false)
  })

  it('수량이 0 이하이면 실패한다', () => {
    const result = createInvestmentTradeSchema.safeParse({ ...validTrade, quantity: 0 })
    expect(result.success).toBe(false)
  })

  it('수량은 소수를 허용한다', () => {
    const result = createInvestmentTradeSchema.safeParse({ ...validTrade, quantity: 0.5 })
    expect(result.success).toBe(true)
  })

  it('단가가 음수이면 실패한다', () => {
    const result = createInvestmentTradeSchema.safeParse({ ...validTrade, unitPrice: -1 })
    expect(result.success).toBe(false)
  })

  it('ticker와 accountId는 선택사항이다', () => {
    const { ticker, accountId, ...rest } = validTrade
    const result = createInvestmentTradeSchema.safeParse(rest)
    expect(result.success).toBe(true)
  })

  it('memo는 500자 이하여야 한다', () => {
    const result = createInvestmentTradeSchema.safeParse({ ...validTrade, memo: 'a'.repeat(501) })
    expect(result.success).toBe(false)
  })
})

describe('updateInvestmentTradeSchema', () => {
  it('부분 업데이트를 허용한다', () => {
    const result = updateInvestmentTradeSchema.safeParse({ unitPrice: 185000 })
    expect(result.success).toBe(true)
  })

  it('빈 객체를 허용한다', () => {
    const result = updateInvestmentTradeSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('잘못된 값은 거부한다', () => {
    const result = updateInvestmentTradeSchema.safeParse({ quantity: -5 })
    expect(result.success).toBe(false)
  })
})
