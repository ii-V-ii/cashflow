import { describe, expect, test } from "vitest"

import {
  createInvestmentTradeSchema,
  listTradesQuerySchema,
  tradeRangeQuerySchema,
  updateTradeMemoSchema,
  TRADE_IMMUTABLE_FIELDS,
} from "@/lib/validators"

describe("createInvestmentTradeSchema (API.md §11.2)", () => {
  const valid = {
    assetId: "1b671a64-40d5-491e-99b0-da01ff1f3341",
    tradeType: "buy",
    date: "2026-01-05",
    quantity: 2.5,
    unitPrice: 10_000,
    totalAmount: 25_000,
    netAmount: 25_000,
  }

  test("유효 본문 통과 + fee/tax 기본 0", () => {
    const parsed = createInvestmentTradeSchema.parse(valid)
    expect(parsed.fee).toBe(0)
    expect(parsed.tax).toBe(0)
    expect(parsed.quantity).toBe(2.5)
  })

  test("quantity는 0 초과 소수 허용, 금액은 0 이상 정수", () => {
    expect(() =>
      createInvestmentTradeSchema.parse({ ...valid, quantity: 0 }),
    ).toThrow()
    expect(() =>
      createInvestmentTradeSchema.parse({ ...valid, unitPrice: -1 }),
    ).toThrow()
    expect(() =>
      createInvestmentTradeSchema.parse({ ...valid, totalAmount: 100.5 }),
    ).toThrow()
  })

  test("ticker는 20자 이하, 빈 문자열은 null 정규화", () => {
    expect(
      createInvestmentTradeSchema.parse({ ...valid, ticker: "AAPL" }).ticker,
    ).toBe("AAPL")
    expect(createInvestmentTradeSchema.parse({ ...valid, ticker: "" }).ticker).toBeNull()
    expect(() =>
      createInvestmentTradeSchema.parse({ ...valid, ticker: "T".repeat(21) }),
    ).toThrow()
  })

  test("잘못된 tradeType 거부", () => {
    expect(() =>
      createInvestmentTradeSchema.parse({ ...valid, tradeType: "hold" }),
    ).toThrow()
  })

  test("수량 상한 초과 거부 (toFixed 지수 표기 크래시 방지)", () => {
    expect(() =>
      createInvestmentTradeSchema.parse({ ...valid, quantity: 1e21 }),
    ).toThrow()
  })

  test("net_amount 규약(DB.md §1.9): buy = total+fee+tax", () => {
    const buyWithCosts = {
      ...valid,
      fee: 100,
      tax: 50,
      netAmount: 25_150, // 25000 + 100 + 50
    }
    expect(createInvestmentTradeSchema.parse(buyWithCosts).netAmount).toBe(25_150)
    expect(() =>
      createInvestmentTradeSchema.parse({ ...buyWithCosts, netAmount: 24_850 }),
    ).toThrow()
  })

  test("net_amount 규약: sell/dividend = total−fee−tax", () => {
    const sellWithCosts = {
      ...valid,
      tradeType: "sell",
      fee: 100,
      tax: 50,
      netAmount: 24_850, // 25000 − 100 − 50
    }
    expect(createInvestmentTradeSchema.parse(sellWithCosts).netAmount).toBe(24_850)
    expect(() =>
      createInvestmentTradeSchema.parse({ ...sellWithCosts, netAmount: 25_150 }),
    ).toThrow()
  })
})

describe("updateTradeMemoSchema — 메모만 수정 (API.md §11.4)", () => {
  test("memo만 허용, null 허용", () => {
    expect(updateTradeMemoSchema.parse({ memo: "메모" })).toEqual({ memo: "메모" })
    expect(updateTradeMemoSchema.parse({ memo: null })).toEqual({ memo: null })
  })

  test("FIFO 영향 필드 목록이 잠금 대상과 일치한다", () => {
    expect(TRADE_IMMUTABLE_FIELDS).toEqual(
      expect.arrayContaining([
        "assetId",
        "tradeType",
        "date",
        "ticker",
        "quantity",
        "unitPrice",
        "totalAmount",
        "fee",
        "tax",
        "netAmount",
        "accountId",
      ]),
    )
  })
})

describe("listTradesQuerySchema / tradeRangeQuerySchema (API.md §11.1, §11.6)", () => {
  test("기본 page=1, limit=20", () => {
    const parsed = listTradesQuerySchema.parse({})
    expect(parsed.page).toBe(1)
    expect(parsed.limit).toBe(20)
  })

  test("assetId uuid·기간 필터", () => {
    const parsed = listTradesQuerySchema.parse({
      assetId: "1b671a64-40d5-491e-99b0-da01ff1f3341",
      from: "2026-01-01",
      to: "2026-12-31",
    })
    expect(parsed.assetId).toBe("1b671a64-40d5-491e-99b0-da01ff1f3341")
    expect(() => listTradesQuerySchema.parse({ from: "2026/01/01" })).toThrow()
  })

  test("tradeRangeQuerySchema: from/to 선택", () => {
    expect(tradeRangeQuerySchema.parse({})).toEqual({})
    expect(
      tradeRangeQuerySchema.parse({ from: "2026-01-01", to: "2026-01-31" }),
    ).toEqual({ from: "2026-01-01", to: "2026-01-31" })
  })
})
