/**
 * FIFO 로트 매칭 TS 레퍼런스 구현 (프레임워크 독립 순수 함수).
 *
 * create/delete_investment_trade RPC(docs/DB.md §3.4-3.5)의 기준(oracle)이며
 * property-based 교차 검증(tests/cross)의 비교 대상이다. 따라서 RPC와 다음을
 * 정확히 일치시킨다:
 *   - FIFO 정렬 키: (date ASC, id ASC) / 역FIFO 복원: (date DESC, id DESC)
 *   - 수량 연산: numeric(20,8)과 동일하게 소수 8자리 고정 스케일(BigInt) 정수 연산
 *   - 실현손익 반올림: PG round(numeric) = half away from zero
 *   - ticker 매칭: 동일 문자열 또는 (NULL ↔ NULL)
 *
 * 레거시 이식: src/db/repositories/investment-trade-repository.ts 의
 * matchSellToLots / reverseLotMatching (git show main:...) — 단, 정렬 tie-break는
 * 레거시 created_at 대신 RPC와 동일한 id 를 사용한다.
 */

export type FifoErrorCode =
  | "INSUFFICIENT_HOLDINGS"
  | "TRADE_HAS_DEPENDENTS"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"

export class FifoError extends Error {
  readonly code: FifoErrorCode

  constructor(code: FifoErrorCode, message: string) {
    super(message)
    this.name = "FifoError"
    this.code = code
  }
}

/** 열린 매수 로트 — investment_trades의 buy 행에 대응 */
export interface FifoLot {
  /** uuid 문자열 — PG uuid 정렬(바이트 순)과 소문자 hex 문자열 정렬이 일치 */
  id: string
  /** YYYY-MM-DD — 문자열 사전순 = 날짜순 */
  date: string
  quantity: number
  remainingQuantity: number
  unitPrice: number
}

export type FifoTradeType = "buy" | "sell" | "dividend"

export interface FifoTradeInput {
  id: string
  assetId: string
  ticker: string | null
  tradeType: FifoTradeType
  date: string
  quantity: number
  unitPrice: number
  totalAmount: number
  netAmount: number
}

/** 원장 항목 — 파생 2컬럼(remainingQuantity, realizedGain) 포함 */
export interface FifoTrade extends FifoTradeInput {
  remainingQuantity: number
  realizedGain: number
}

export interface MatchSellResult {
  realizedGain: number
  lots: FifoLot[]
}

// ── numeric(20,8) 등가 고정소수점 연산 ─────────────────────────

const QTY_FRACTION_DIGITS = 8
const QTY_SCALE = BigInt(10) ** BigInt(QTY_FRACTION_DIGITS)
// tsconfig target(ES2017)에서 BigInt 리터럴(0n)을 쓸 수 없어 상수로 정의한다
const BIGINT_ZERO = BigInt(0)
const BIGINT_ONE = BigInt(1)
const BIGINT_TWO = BigInt(2)

/** 수량(number) → 소수 8자리 스케일 BigInt. 십진 문자열 경유로 이진 오차 제거 */
function toScaledQty(value: number, label: string): bigint {
  if (!Number.isFinite(value)) {
    throw new FifoError("VALIDATION_ERROR", `${label}이(가) 유한수가 아닙니다: ${value}`)
  }
  const fixed = value.toFixed(QTY_FRACTION_DIGITS) // "123.45678900"
  const negative = fixed.startsWith("-")
  const [intPart, fracPart] = (negative ? fixed.slice(1) : fixed).split(".")
  const scaled = BigInt(intPart) * QTY_SCALE + BigInt(fracPart)
  return negative ? -scaled : scaled
}

function fromScaledQty(value: bigint): number {
  return Number(value) / Number(QTY_SCALE)
}

function toAmount(value: number, label: string): bigint {
  if (!Number.isSafeInteger(value)) {
    throw new FifoError("VALIDATION_ERROR", `${label}은(는) 정수여야 합니다: ${value}`)
  }
  return BigInt(value)
}

/** PG round(numeric) 등가: half away from zero */
function roundScaledHalfAwayFromZero(scaled: bigint): number {
  const negative = scaled < BIGINT_ZERO
  const abs = negative ? -scaled : scaled
  let quotient = abs / QTY_SCALE
  if ((abs % QTY_SCALE) * BIGINT_TWO >= QTY_SCALE) quotient += BIGINT_ONE
  return Number(negative ? -quotient : quotient)
}

// ── 정렬 (RPC ORDER BY date, id 와 동일 키) ─────────────────────

function compareFifo(a: { date: string; id: string }, b: { date: string; id: string }): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  if (a.id !== b.id) return a.id < b.id ? -1 : 1
  return 0
}

function sameTicker(a: string | null, b: string | null): boolean {
  return a === b
}

// ── 핵심 순수 함수 ──────────────────────────────────────────────

/**
 * 매도 1건을 열린 로트에 FIFO(date, id 오름차순)로 매칭한다.
 * 실현손익 = round(매도 수령액(net) − Σ 매칭 수량 × 로트 단가).
 * 입력은 변형하지 않고 갱신된 로트 배열(원래 순서 유지)을 돌려준다.
 */
export function matchSellToLots(
  lots: readonly FifoLot[],
  sellQuantity: number,
  sellNetAmount: number,
): MatchSellResult {
  let remaining = toScaledQty(sellQuantity, "매도 수량")
  if (remaining <= BIGINT_ZERO) {
    throw new FifoError("VALIDATION_ERROR", "매도 수량은 0보다 커야 합니다")
  }
  const netScaled = toAmount(sellNetAmount, "매도 수령액") * QTY_SCALE

  const ordered = lots
    .map((fifoLot, index) => ({ fifoLot, index }))
    .sort((a, b) => compareFifo(a.fifoLot, b.fifoLot))

  let totalCostScaled = BIGINT_ZERO
  const updatedRemaining = new Map<number, bigint>()

  for (const { fifoLot, index } of ordered) {
    if (remaining <= BIGINT_ZERO) break
    const lotRemaining = toScaledQty(fifoLot.remainingQuantity, "로트 잔여 수량")
    if (lotRemaining <= BIGINT_ZERO) continue

    const matched = lotRemaining < remaining ? lotRemaining : remaining
    totalCostScaled += matched * toAmount(fifoLot.unitPrice, "로트 단가")
    updatedRemaining.set(index, lotRemaining - matched)
    remaining -= matched
  }

  if (remaining > BIGINT_ZERO) {
    throw new FifoError(
      "INSUFFICIENT_HOLDINGS",
      "보유수량 부족: 매도 수량이 매수 잔여 수량을 초과합니다",
    )
  }

  return {
    realizedGain: roundScaledHalfAwayFromZero(netScaled - totalCostScaled),
    lots: lots.map((fifoLot, index) => {
      const next = updatedRemaining.get(index)
      return next === undefined
        ? { ...fifoLot }
        : { ...fifoLot, remainingQuantity: fromScaledQty(next) }
    }),
  }
}

/**
 * 매도 삭제 시 역FIFO 복원: 가장 최근에 차감된 로트(date, id 내림차순)부터
 * 소비량(quantity − remaining)을 되돌린다. 원 매칭 기록이 없으므로 근사 복원
 * (레거시 reverseLotMatching과 동일한 알려진 한계).
 */
export function reverseLotMatching(
  lots: readonly FifoLot[],
  sellQuantity: number,
): FifoLot[] {
  let toRestore = toScaledQty(sellQuantity, "복원 수량")

  const ordered = lots
    .map((fifoLot, index) => ({ fifoLot, index }))
    .sort((a, b) => compareFifo(b.fifoLot, a.fifoLot))

  const updatedRemaining = new Map<number, bigint>()

  for (const { fifoLot, index } of ordered) {
    if (toRestore <= BIGINT_ZERO) break
    const lotQty = toScaledQty(fifoLot.quantity, "로트 수량")
    const lotRemaining = toScaledQty(fifoLot.remainingQuantity, "로트 잔여 수량")
    const consumed = lotQty - lotRemaining
    if (consumed <= BIGINT_ZERO) continue

    const restore = consumed < toRestore ? consumed : toRestore
    updatedRemaining.set(index, lotRemaining + restore)
    toRestore -= restore
  }

  return lots.map((fifoLot, index) => {
    const next = updatedRemaining.get(index)
    return next === undefined
      ? { ...fifoLot }
      : { ...fifoLot, remainingQuantity: fromScaledQty(next) }
  })
}

// ── 원장 시뮬레이터 (create/delete_investment_trade 등가) ───────

function toLot(trade: FifoTrade): FifoLot {
  return {
    id: trade.id,
    date: trade.date,
    quantity: trade.quantity,
    remainingQuantity: trade.remainingQuantity,
    unitPrice: trade.unitPrice,
  }
}

function isOpenLotFor(trade: FifoTrade, assetId: string, ticker: string | null): boolean {
  return (
    trade.tradeType === "buy" &&
    trade.assetId === assetId &&
    sameTicker(trade.ticker, ticker)
  )
}

/**
 * create_investment_trade RPC 등가: 원장에 매매 1건을 적용한 새 원장을 돌려준다.
 * buy → 로트 생성 / sell → FIFO 차감 + realized_gain / dividend → 기록만.
 */
export function applyTrade(
  ledger: readonly FifoTrade[],
  input: FifoTradeInput,
): FifoTrade[] {
  if (toScaledQty(input.quantity, "수량") <= BIGINT_ZERO) {
    throw new FifoError("VALIDATION_ERROR", "수량은 0보다 커야 합니다")
  }
  if (toAmount(input.totalAmount, "총액") < BIGINT_ZERO || toAmount(input.netAmount, "순액") < BIGINT_ZERO) {
    throw new FifoError("VALIDATION_ERROR", "금액은 0 이상이어야 합니다")
  }

  if (input.tradeType === "buy") {
    return [...ledger, { ...input, remainingQuantity: input.quantity, realizedGain: 0 }]
  }
  if (input.tradeType === "dividend") {
    return [...ledger, { ...input, remainingQuantity: 0, realizedGain: 0 }]
  }

  // sell — 같은 자산·ticker의 열린 로트에 FIFO 매칭
  const lotEntries = ledger
    .map((trade, index) => ({ trade, index }))
    .filter(
      ({ trade }) =>
        isOpenLotFor(trade, input.assetId, input.ticker) && trade.remainingQuantity > 0,
    )
  const { realizedGain, lots } = matchSellToLots(
    lotEntries.map(({ trade }) => toLot(trade)),
    input.quantity,
    input.netAmount,
  )

  const updatedByIndex = new Map(
    lotEntries.map(({ index }, lotPosition) => [index, lots[lotPosition]]),
  )
  const next = ledger.map((trade, index) => {
    const updated = updatedByIndex.get(index)
    return updated === undefined
      ? trade
      : { ...trade, remainingQuantity: updated.remainingQuantity }
  })
  return [...next, { ...input, remainingQuantity: 0, realizedGain }]
}

/**
 * delete_investment_trade RPC 등가: 매매 1건을 제거한 새 원장을 돌려준다.
 * 일부 매칭된 buy 로트 삭제 금지 가드 + sell 삭제 시 역FIFO 복원 포함.
 */
export function removeTrade(ledger: readonly FifoTrade[], id: string): FifoTrade[] {
  const target = ledger.find((trade) => trade.id === id)
  if (!target) {
    throw new FifoError("NOT_FOUND", `매매 기록을 찾을 수 없습니다: ${id}`)
  }

  if (target.tradeType === "buy" && target.remainingQuantity < target.quantity) {
    throw new FifoError(
      "TRADE_HAS_DEPENDENTS",
      "이미 일부 매도에 매칭된 매수 기록은 삭제할 수 없습니다. 매도 기록을 먼저 삭제하세요",
    )
  }

  if (target.tradeType !== "sell") {
    return ledger.filter((trade) => trade.id !== id)
  }

  const lotEntries = ledger
    .map((trade, index) => ({ trade, index }))
    .filter(({ trade }) => isOpenLotFor(trade, target.assetId, target.ticker))
  const restored = reverseLotMatching(
    lotEntries.map(({ trade }) => toLot(trade)),
    target.quantity,
  )

  const updatedByIndex = new Map(
    lotEntries.map(({ index }, lotPosition) => [index, restored[lotPosition]]),
  )
  const result: FifoTrade[] = []
  ledger.forEach((trade, index) => {
    if (trade.id === id) return
    const updated = updatedByIndex.get(index)
    result.push(
      updated === undefined
        ? trade
        : { ...trade, remainingQuantity: updated.remainingQuantity },
    )
  })
  return result
}
