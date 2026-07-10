import { afterAll, beforeEach, describe, expect, test } from "vitest"

import {
  applyTrade,
  FifoError,
  removeTrade,
  type FifoTrade,
  type FifoTradeInput,
  type FifoTradeType,
} from "@/lib/calculations/fifo"

import {
  createTestDb,
  truncateAssetInvestmentCore,
} from "../integration/helpers/db"

/**
 * FIFO property-based 교차 검증 (Phase 2C 핵심 수용 기준).
 *
 * 시드 고정 랜덤 매매 시퀀스(시드당 120 연산 × 3시드 = 360+ 연산)를
 * ① TS 레퍼런스(src/lib/calculations/fifo.ts applyTrade/removeTrade)와
 * ② DB RPC(create/delete_investment_trade) 양쪽에 동일하게 적용하고,
 * 매 연산마다 다음이 일치함을 검증한다:
 *   - 성공/실패 여부와 실패 종류 (INSUFFICIENT_HOLDINGS ↔ CF423, TRADE_HAS_DEPENDENTS ↔ CF409)
 *   - 매도 실현손익(realized_gain)
 *   - 전 로트의 remaining_quantity 상태
 *
 * 정렬 tie-break(id)는 RPC가 생성한 uuid를 TS 원장에 그대로 사용해 맞춘다
 * (PG uuid 바이트 정렬 == 소문자 hex 문자열 사전순).
 */

const sql = createTestDb()

afterAll(async () => {
  await sql.end()
})

beforeEach(async () => {
  await truncateAssetInvestmentCore(sql)
})

// ─── 시드 고정 PRNG (mulberry32) ─────────────────────────────

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)]
}

function randomInt(rand: () => number, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1))
}

/**
 * 소수 8자리 수량 — numeric(20,8) 전체 정밀도 경계를 친다.
 * 최소값 1/1e8 = 0.00000001 포함. JSON 직렬화(shortest round-trip)와
 * toFixed(8)이 같은 8자리 십진값을 재현하도록 8자리 고정 스케일 정수에서 생성.
 */
function randomQuantity(rand: () => number): number {
  return randomInt(rand, 1, 20_000_000_000) / 100_000_000
}

/** 임의 실수를 8자리 십진 수량으로 양자화 (PG·TS 양쪽에서 동일 표현 보장) */
function quantize8(value: number): number {
  return Number(value.toFixed(8))
}

function randomDate(rand: () => number): string {
  const month = String(randomInt(rand, 1, 12)).padStart(2, "0")
  const day = String(randomInt(rand, 1, 28)).padStart(2, "0")
  return `2026-${month}-${day}`
}

// ─── DB 헬퍼 ─────────────────────────────────────────────────

async function seedAssets(): Promise<string[]> {
  const category = await sql`
    INSERT INTO public.asset_categories (name, kind)
    VALUES ('교차검증', 'financial') RETURNING id
  `
  const assets = await sql`
    INSERT INTO public.assets (name, asset_category_id, acquisition_date, acquisition_cost)
    VALUES ('자산A', ${category[0].id}, '2026-01-01', 0),
           ('자산B', ${category[0].id}, '2026-01-01', 0)
    RETURNING id
  `
  return assets.map((row) => row.id as string)
}

interface RpcTradeRow {
  id: string
  realized_gain: string | number
}

type RpcOutcome =
  | { ok: true; row: RpcTradeRow }
  | { ok: false; code: string }

async function rpcCreate(payload: Record<string, unknown>): Promise<RpcOutcome> {
  try {
    const rows = await sql`
      SELECT id, realized_gain
      FROM public.create_investment_trade(${sql.json(payload as never)})
    `
    return { ok: true, row: rows[0] as unknown as RpcTradeRow }
  } catch (error) {
    return { ok: false, code: (error as { code?: string }).code ?? "UNKNOWN" }
  }
}

async function rpcDelete(id: string): Promise<RpcOutcome> {
  try {
    await sql`SELECT public.delete_investment_trade(${id})`
    return { ok: true, row: { id, realized_gain: 0 } }
  } catch (error) {
    return { ok: false, code: (error as { code?: string }).code ?? "UNKNOWN" }
  }
}

interface DbLotState {
  id: string
  remaining_quantity: string
  realized_gain: string
}

async function fetchDbState(): Promise<Map<string, { remaining: number; gain: number }>> {
  const rows = await sql<DbLotState[]>`
    SELECT id, remaining_quantity::text, realized_gain::text
    FROM public.investment_trades
    ORDER BY id
  `
  return new Map(
    rows.map((row) => [
      row.id,
      {
        remaining: Number(row.remaining_quantity),
        gain: Number(row.realized_gain),
      },
    ]),
  )
}

/** TS 원장 상태와 DB 로트 상태의 완전 일치를 검증 */
function assertLedgerMatches(
  ledger: readonly FifoTrade[],
  dbState: Map<string, { remaining: number; gain: number }>,
  context: string,
): void {
  expect(dbState.size, `${context}: 원장 건수 불일치`).toBe(ledger.length)
  for (const trade of ledger) {
    const db = dbState.get(trade.id)
    expect(db, `${context}: DB에 없는 거래 ${trade.id}`).toBeDefined()
    expect(db!.remaining, `${context}: remaining 불일치 (${trade.id})`).toBe(
      trade.remainingQuantity,
    )
    expect(db!.gain, `${context}: realized_gain 불일치 (${trade.id})`).toBe(
      trade.realizedGain,
    )
  }
}

// ─── 랜덤 연산 생성 + 양쪽 적용 ──────────────────────────────

const TICKERS = ["AAPL", "MSFT", null] as const

interface CreateOp {
  kind: "create"
  input: Omit<FifoTradeInput, "id">
}

interface DeleteOp {
  kind: "delete"
  targetIndex: number
}

type Op = CreateOp | DeleteOp

function heldQuantity(
  ledger: readonly FifoTrade[],
  assetId: string,
  ticker: string | null,
): number {
  return ledger
    .filter(
      (trade) =>
        trade.tradeType === "buy" &&
        trade.assetId === assetId &&
        trade.ticker === ticker,
    )
    .reduce((sum, trade) => sum + trade.remainingQuantity, 0)
}

function nextOp(
  rand: () => number,
  ledger: readonly FifoTrade[],
  assetIds: readonly string[],
): Op {
  const roll = rand()

  if (roll < 0.1 && ledger.length > 0) {
    return { kind: "delete", targetIndex: Math.floor(rand() * ledger.length) }
  }

  const assetId = pick(rand, assetIds)
  const ticker = pick(rand, TICKERS)
  const date = randomDate(rand)

  if (roll < 0.4) {
    // 매도 — 보유량 내 매도가 다수, 일부는 의도적으로 초과(에러 경로 검증)
    const held = heldQuantity(ledger, assetId, ticker)
    const exceed = rand() < 0.15 || held === 0
    const quantity = exceed
      ? quantize8(held + randomQuantity(rand))
      : Math.max(0.00000001, quantize8(held * rand()))
    const net = randomInt(rand, 0, 50_000_000)
    return {
      kind: "create",
      input: {
        assetId,
        ticker,
        tradeType: "sell",
        date,
        quantity,
        unitPrice: 0,
        totalAmount: net,
        netAmount: net,
      },
    }
  }

  const tradeType: FifoTradeType = roll < 0.9 ? "buy" : "dividend"
  const quantity = randomQuantity(rand)
  const unitPrice = randomInt(rand, 1, 500_000)
  const total = Math.round(quantity * unitPrice)
  return {
    kind: "create",
    input: {
      assetId,
      ticker,
      tradeType,
      date,
      quantity,
      unitPrice,
      totalAmount: total,
      netAmount: total,
    },
  }
}

/** TS 레퍼런스에 연산을 적용해 (성공 원장 | 실패 코드)를 얻는다 — 순수, 커밋 없음 */
function applyToReference(
  ledger: readonly FifoTrade[],
  op: Op,
  id: string,
): { ok: true; next: FifoTrade[] } | { ok: false; code: string } {
  try {
    if (op.kind === "create") {
      return { ok: true, next: applyTrade(ledger, { ...op.input, id }) }
    }
    return { ok: true, next: removeTrade(ledger, ledger[op.targetIndex].id) }
  } catch (error) {
    if (error instanceof FifoError) {
      return { ok: false, code: error.code }
    }
    throw error
  }
}

/** FifoError 코드 ↔ RPC 커스텀 SQLSTATE 매핑 (migration 20260713000030 규약) */
const ERROR_CODE_MAP: Record<string, string> = {
  INSUFFICIENT_HOLDINGS: "CF423",
  TRADE_HAS_DEPENDENTS: "CF409",
  VALIDATION_ERROR: "CF400",
}

async function runSequence(seed: number, opCount: number): Promise<void> {
  const rand = mulberry32(seed)
  const assetIds = await seedAssets()
  let ledger: FifoTrade[] = []
  let checkedOps = 0
  // 경로 커버리지 카운터 — 시퀀스가 퇴화(예: 매도 전부 실패)하지 않았음을 보장
  const covered = { sellOk: 0, sellFail: 0, deleteOk: 0, deleteFail: 0 }

  for (let index = 0; index < opCount; index += 1) {
    const op = nextOp(rand, ledger, assetIds)
    const context = `seed=${seed} op#${index} (${op.kind})`

    if (op.kind === "create") {
      const payload = {
        asset_id: op.input.assetId,
        trade_type: op.input.tradeType,
        date: op.input.date,
        ticker: op.input.ticker,
        quantity: op.input.quantity,
        unit_price: op.input.unitPrice,
        total_amount: op.input.totalAmount,
        net_amount: op.input.netAmount,
      }
      const rpc = await rpcCreate(payload)
      // TS 레퍼런스 결과 — id는 성공 시 RPC 생성 uuid를 사용 (tie-break 일치)
      const probe = applyToReference(ledger, op, "00000000-0000-0000-0000-000000000000")

      if (rpc.ok) {
        expect(probe.ok, `${context}: RPC 성공인데 레퍼런스 실패`).toBe(true)
        const committed = applyToReference(ledger, op, rpc.row.id)
        if (!committed.ok) throw new Error(`${context}: 재적용 실패`)
        ledger = committed.next
        // 매도 실현손익 즉시 비교
        if (op.input.tradeType === "sell") {
          const referenceGain = ledger[ledger.length - 1].realizedGain
          expect(Number(rpc.row.realized_gain), `${context}: realized_gain`).toBe(
            referenceGain,
          )
          covered.sellOk += 1
        }
      } else {
        expect(probe.ok, `${context}: RPC 실패(${rpc.code})인데 레퍼런스 성공`).toBe(false)
        const expectedSqlState = ERROR_CODE_MAP[(probe as { code: string }).code]
        expect(rpc.code, `${context}: 실패 코드 불일치`).toBe(expectedSqlState)
        if (op.input.tradeType === "sell") covered.sellFail += 1
      }
    } else {
      const targetId = ledger[op.targetIndex].id
      const rpc = await rpcDelete(targetId)
      const probe = applyToReference(ledger, op, targetId)

      if (rpc.ok) {
        expect(probe.ok, `${context}: RPC 성공인데 레퍼런스 실패`).toBe(true)
        ledger = (probe as { ok: true; next: FifoTrade[] }).next
        covered.deleteOk += 1
      } else {
        expect(probe.ok, `${context}: RPC 실패(${rpc.code})인데 레퍼런스 성공`).toBe(false)
        const expectedSqlState = ERROR_CODE_MAP[(probe as { code: string }).code]
        expect(rpc.code, `${context}: 실패 코드 불일치`).toBe(expectedSqlState)
        covered.deleteFail += 1
      }
    }

    // 주기적 전체 로트 상태 대조 (매 10연산) + 마지막 연산
    if (index % 10 === 9 || index === opCount - 1) {
      assertLedgerMatches(ledger, await fetchDbState(), context)
      checkedOps += 1
    }
  }

  expect(checkedOps).toBeGreaterThan(0)
  expect(ledger.length).toBeGreaterThan(0)
  // 핵심 경로가 모두 최소 1회 이상 실행되었는지 보장
  expect(covered.sellOk, "성공한 FIFO 매도가 없음").toBeGreaterThan(0)
  expect(covered.sellFail, "보유수량 부족 매도가 없음").toBeGreaterThan(0)
  expect(covered.deleteOk, "성공한 삭제(역FIFO 포함)가 없음").toBeGreaterThan(0)
}

// ─── 실행 ────────────────────────────────────────────────────

describe("FIFO 교차 검증 — TS 레퍼런스 == RPC (property-based)", () => {
  const OPS_PER_SEED = 120

  test("seed 1: 랜덤 매매 시퀀스 120연산 완전 일치", async () => {
    await runSequence(1, OPS_PER_SEED)
  }, 60_000)

  test("seed 42: 랜덤 매매 시퀀스 120연산 완전 일치", async () => {
    await runSequence(42, OPS_PER_SEED)
  }, 60_000)

  test("seed 20260713: 랜덤 매매 시퀀스 120연산 완전 일치", async () => {
    await runSequence(20260713, OPS_PER_SEED)
  }, 60_000)

  test("seed 7: 랜덤 매매 시퀀스 120연산 완전 일치 (8자리 정밀도 경계)", async () => {
    await runSequence(7, OPS_PER_SEED)
  }, 60_000)
})
