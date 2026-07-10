import { describe, expect, test } from "vitest"

import {
  applyTrade,
  FifoError,
  matchSellToLots,
  removeTrade,
  reverseLotMatching,
  type FifoLot,
  type FifoTrade,
} from "@/lib/calculations/fifo"

/**
 * FIFO TS 레퍼런스 단위 테스트 (docs/DB.md §3.4-3.5, 레거시
 * investment-trade-repository.ts matchSellToLots/reverseLotMatching 동작 보존).
 * 이 구현은 create/delete_investment_trade RPC와 property-based 교차 검증의
 * 기준(oracle)이 된다 — 정렬 키 (date, id)·반올림 규칙까지 RPC와 동일해야 한다.
 */

function lot(partial: Partial<FifoLot> & { id: string }): FifoLot {
  return {
    date: "2026-01-01",
    quantity: 10,
    remainingQuantity: 10,
    unitPrice: 1000,
    ...partial,
  }
}

describe("matchSellToLots — FIFO 차감·실현손익", () => {
  test("단일 로트 전량 매도: realizedGain = net − 원가", () => {
    const lots = [lot({ id: "a", quantity: 10, remainingQuantity: 10, unitPrice: 1000 })]

    const result = matchSellToLots(lots, 10, 12000)

    expect(result.realizedGain).toBe(2000) // 12000 − 10×1000
    expect(result.lots).toHaveLength(1)
    expect(result.lots[0].remainingQuantity).toBe(0)
  })

  test("여러 로트에 걸친 부분 매도: date 오름차순 FIFO", () => {
    const lots = [
      lot({ id: "b", date: "2026-01-05", unitPrice: 2000 }),
      lot({ id: "a", date: "2026-01-01", unitPrice: 1000 }),
    ]

    // 15주 매도 → 1/1 로트 10주(원가 10000) + 1/5 로트 5주(원가 10000) = 20000
    const result = matchSellToLots(lots, 15, 26000)

    expect(result.realizedGain).toBe(6000)
    const byId = new Map(result.lots.map((l) => [l.id, l]))
    expect(byId.get("a")?.remainingQuantity).toBe(0)
    expect(byId.get("b")?.remainingQuantity).toBe(5)
  })

  test("같은 날짜 로트는 id 오름차순으로 차감 (RPC ORDER BY date, id와 동일)", () => {
    const lots = [
      lot({ id: "bbbb", date: "2026-01-01", unitPrice: 2000 }),
      lot({ id: "aaaa", date: "2026-01-01", unitPrice: 1000 }),
    ]

    const result = matchSellToLots(lots, 10, 10000)

    // id 'aaaa'(단가 1000)가 먼저 소진되어야 손익 0
    expect(result.realizedGain).toBe(0)
    const byId = new Map(result.lots.map((l) => [l.id, l]))
    expect(byId.get("aaaa")?.remainingQuantity).toBe(0)
    expect(byId.get("bbbb")?.remainingQuantity).toBe(10)
  })

  test("보유수량 부족이면 FifoError(INSUFFICIENT_HOLDINGS)", () => {
    const lots = [lot({ id: "a", remainingQuantity: 3 })]

    expect(() => matchSellToLots(lots, 5, 1000)).toThrowError(FifoError)
    try {
      matchSellToLots(lots, 5, 1000)
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(FifoError)
      expect((error as FifoError).code).toBe("INSUFFICIENT_HOLDINGS")
    }
  })

  test("소수 수량 매도 원가 반올림: 음수 손익은 절대값 기준 반올림(half away from zero)", () => {
    // 원가 = 0.5 × 1001 = 500.5 → gain = 498 − 500.5 = −2.5 → PG round() = −3
    const lots = [lot({ id: "a", quantity: 1, remainingQuantity: 1, unitPrice: 1001 })]

    const result = matchSellToLots(lots, 0.5, 498)

    expect(result.realizedGain).toBe(-3)
    expect(result.lots[0].remainingQuantity).toBe(0.5)
  })

  test("양수 손익 반올림: 2.5 → 3 (half away from zero)", () => {
    // 원가 = 0.5 × 1001 = 500.5 → gain = 503 − 500.5 = 2.5 → 3
    const lots = [lot({ id: "a", quantity: 1, remainingQuantity: 1, unitPrice: 1001 })]

    expect(matchSellToLots(lots, 0.5, 503).realizedGain).toBe(3)
  })

  test("이진 부동소수점 오차 없이 소수 수량을 처리한다 (0.1+0.2 케이스)", () => {
    const lots = [
      lot({ id: "a", date: "2026-01-01", quantity: 0.1, remainingQuantity: 0.1, unitPrice: 100 }),
      lot({ id: "b", date: "2026-01-02", quantity: 0.2, remainingQuantity: 0.2, unitPrice: 100 }),
    ]

    const result = matchSellToLots(lots, 0.3, 30)

    expect(result.realizedGain).toBe(0)
    expect(result.lots.every((l) => l.remainingQuantity === 0)).toBe(true)
  })

  test("입력 로트 배열을 변형하지 않는다 (불변성)", () => {
    const lots = [lot({ id: "a" })]
    const snapshot = structuredClone(lots)

    matchSellToLots(lots, 5, 5000)

    expect(lots).toEqual(snapshot)
  })
})

describe("reverseLotMatching — 역FIFO 복원", () => {
  test("가장 최근에 차감된 로트부터 복원한다 (date 내림차순)", () => {
    const lots = [
      lot({ id: "a", date: "2026-01-01", quantity: 10, remainingQuantity: 0 }),
      lot({ id: "b", date: "2026-01-05", quantity: 10, remainingQuantity: 5 }),
    ]

    // 8주 복원: 1/5 로트에 5주 먼저, 나머지 3주는 1/1 로트에
    const restored = reverseLotMatching(lots, 8)

    const byId = new Map(restored.map((l) => [l.id, l]))
    expect(byId.get("b")?.remainingQuantity).toBe(10)
    expect(byId.get("a")?.remainingQuantity).toBe(3)
  })

  test("같은 날짜면 id 내림차순으로 복원한다", () => {
    const lots = [
      lot({ id: "aaaa", date: "2026-01-01", quantity: 10, remainingQuantity: 0 }),
      lot({ id: "bbbb", date: "2026-01-01", quantity: 10, remainingQuantity: 0 }),
    ]

    const restored = reverseLotMatching(lots, 10)

    const byId = new Map(restored.map((l) => [l.id, l]))
    expect(byId.get("bbbb")?.remainingQuantity).toBe(10)
    expect(byId.get("aaaa")?.remainingQuantity).toBe(0)
  })

  test("차감되지 않은 로트(remaining = quantity)는 건드리지 않는다", () => {
    const lots = [
      lot({ id: "a", date: "2026-01-01", quantity: 10, remainingQuantity: 4 }),
      lot({ id: "b", date: "2026-01-05", quantity: 10, remainingQuantity: 10 }),
    ]

    const restored = reverseLotMatching(lots, 6)

    const byId = new Map(restored.map((l) => [l.id, l]))
    expect(byId.get("a")?.remainingQuantity).toBe(10)
    expect(byId.get("b")?.remainingQuantity).toBe(10)
  })

  test("입력 로트 배열을 변형하지 않는다 (불변성)", () => {
    const lots = [lot({ id: "a", remainingQuantity: 0 })]
    const snapshot = structuredClone(lots)

    reverseLotMatching(lots, 10)

    expect(lots).toEqual(snapshot)
  })
})

describe("applyTrade / removeTrade — 원장 시뮬레이터 (RPC 교차 검증 oracle)", () => {
  const ASSET = "asset-1"

  function buy(
    id: string,
    date: string,
    quantity: number,
    unitPrice: number,
    ticker: string | null = "AAPL",
  ) {
    return {
      id,
      assetId: ASSET,
      ticker,
      tradeType: "buy" as const,
      date,
      quantity,
      unitPrice,
      totalAmount: Math.round(quantity * unitPrice),
      netAmount: Math.round(quantity * unitPrice),
    }
  }

  function sell(
    id: string,
    date: string,
    quantity: number,
    netAmount: number,
    ticker: string | null = "AAPL",
  ) {
    return {
      id,
      assetId: ASSET,
      ticker,
      tradeType: "sell" as const,
      date,
      quantity,
      unitPrice: 0,
      totalAmount: netAmount,
      netAmount,
    }
  }

  test("buy는 remaining_quantity = quantity 로트를 만든다", () => {
    const ledger = applyTrade([], buy("t1", "2026-01-01", 10, 1000))

    expect(ledger).toHaveLength(1)
    expect(ledger[0].remainingQuantity).toBe(10)
    expect(ledger[0].realizedGain).toBe(0)
  })

  test("sell은 같은 자산·같은 ticker의 로트만 차감한다", () => {
    let ledger: readonly FifoTrade[] = []
    ledger = applyTrade(ledger, buy("t1", "2026-01-01", 10, 1000, "AAPL"))
    ledger = applyTrade(ledger, buy("t2", "2026-01-01", 10, 1000, "MSFT"))

    ledger = applyTrade(ledger, sell("t3", "2026-01-02", 10, 15000, "AAPL"))

    const byId = new Map(ledger.map((t) => [t.id, t]))
    expect(byId.get("t1")?.remainingQuantity).toBe(0)
    expect(byId.get("t2")?.remainingQuantity).toBe(10)
    expect(byId.get("t3")?.realizedGain).toBe(5000)
  })

  test("ticker null은 null 로트끼리만 매칭된다", () => {
    let ledger: readonly FifoTrade[] = []
    ledger = applyTrade(ledger, buy("t1", "2026-01-01", 10, 1000, null))
    ledger = applyTrade(ledger, buy("t2", "2026-01-01", 10, 2000, "AAPL"))

    ledger = applyTrade(ledger, sell("t3", "2026-01-02", 5, 5000, null))

    const byId = new Map(ledger.map((t) => [t.id, t]))
    expect(byId.get("t1")?.remainingQuantity).toBe(5)
    expect(byId.get("t2")?.remainingQuantity).toBe(10)
  })

  test("dividend는 로트에 영향이 없다", () => {
    let ledger: readonly FifoTrade[] = []
    ledger = applyTrade(ledger, buy("t1", "2026-01-01", 10, 1000))
    ledger = applyTrade(ledger, {
      id: "t2",
      assetId: ASSET,
      ticker: "AAPL",
      tradeType: "dividend",
      date: "2026-01-15",
      quantity: 10,
      unitPrice: 0,
      totalAmount: 300,
      netAmount: 300,
    })

    const byId = new Map(ledger.map((t) => [t.id, t]))
    expect(byId.get("t1")?.remainingQuantity).toBe(10)
    expect(byId.get("t2")?.remainingQuantity).toBe(0)
    expect(byId.get("t2")?.realizedGain).toBe(0)
  })

  test("보유수량 초과 매도는 원장을 바꾸지 않고 FifoError", () => {
    const ledger = applyTrade([], buy("t1", "2026-01-01", 3, 1000))

    expect(() => applyTrade(ledger, sell("t2", "2026-01-02", 5, 5000))).toThrowError(
      FifoError,
    )
    expect(ledger[0].remainingQuantity).toBe(3)
  })

  test("sell 삭제는 역FIFO로 로트를 복원한다", () => {
    let ledger: readonly FifoTrade[] = []
    ledger = applyTrade(ledger, buy("t1", "2026-01-01", 10, 1000))
    ledger = applyTrade(ledger, buy("t2", "2026-01-05", 10, 2000))
    ledger = applyTrade(ledger, sell("t3", "2026-01-10", 15, 30000))

    ledger = removeTrade(ledger, "t3")

    const byId = new Map(ledger.map((t) => [t.id, t]))
    expect(byId.has("t3")).toBe(false)
    expect(byId.get("t1")?.remainingQuantity).toBe(10)
    expect(byId.get("t2")?.remainingQuantity).toBe(10)
  })

  test("일부라도 매칭된 buy 로트 삭제는 FifoError(TRADE_HAS_DEPENDENTS)", () => {
    let ledger: readonly FifoTrade[] = []
    ledger = applyTrade(ledger, buy("t1", "2026-01-01", 10, 1000))
    ledger = applyTrade(ledger, sell("t2", "2026-01-02", 4, 4000))

    try {
      removeTrade(ledger, "t1")
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(FifoError)
      expect((error as FifoError).code).toBe("TRADE_HAS_DEPENDENTS")
    }
  })

  test("매칭되지 않은 buy는 삭제할 수 있다", () => {
    const ledger = applyTrade([], buy("t1", "2026-01-01", 10, 1000))

    expect(removeTrade(ledger, "t1")).toHaveLength(0)
  })

  test("없는 id 삭제는 FifoError(NOT_FOUND)", () => {
    try {
      removeTrade([], "missing")
      expect.unreachable()
    } catch (error) {
      expect((error as FifoError).code).toBe("NOT_FOUND")
    }
  })

  test("레거시 회귀: 매도 여러 건 후 중간 매도 삭제는 근사 복원(총 보유량 보존)", () => {
    let ledger: readonly FifoTrade[] = []
    ledger = applyTrade(ledger, buy("t1", "2026-01-01", 10, 1000))
    ledger = applyTrade(ledger, buy("t2", "2026-02-01", 10, 2000))
    ledger = applyTrade(ledger, sell("t3", "2026-03-01", 8, 9000))
    ledger = applyTrade(ledger, sell("t4", "2026-03-02", 8, 17000))

    ledger = removeTrade(ledger, "t3") // 중간 매도 삭제 → 최근 차감 로트(t2)부터 복원

    const byId = new Map(ledger.map((t) => [t.id, t]))
    const totalRemaining =
      (byId.get("t1")?.remainingQuantity ?? 0) + (byId.get("t2")?.remainingQuantity ?? 0)
    expect(totalRemaining).toBe(12) // 20 매수 − 8 매도(t4 유지)
    expect(byId.get("t2")?.remainingQuantity).toBe(10) // 역FIFO: 최근 로트 우선 복원
    expect(byId.get("t1")?.remainingQuantity).toBe(2)
  })
})
