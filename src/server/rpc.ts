import "server-only"

import { getDb } from "@/server/db/client"

/** Postgres 함수 호출 실패를 { code, message } 형태로 정규화한 에러 */
export class RpcError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = "RpcError"
    this.code = code
  }
}

export type RpcParams = Record<string, unknown>

const VALID_FUNCTION_NAME = /^[a-z_][a-z0-9_]*$/

/**
 * 호출 가능한 RPC 함수 화이트리스트 (docs/DB.md §5 GRANT 목록과 1:1).
 * Phase 1a 시점에 DB에 실재하는 함수는 거래 RPC 3종뿐이며,
 * 나머지는 해당 트랙의 마이그레이션이 랜딩되기 전까지 DB에서 "function does not exist"로 실패한다.
 */
export const ALLOWED_RPC_FUNCTIONS = [
  // Phase 1a (구현됨)
  "create_transaction",
  "update_transaction",
  "delete_transaction",
  // 이후 트랙 (docs/DB.md §3 — 마이그레이션 미랜딩)
  "create_investment_trade",
  "delete_investment_trade",
  "process_due_transactions",
  "snapshot_asset_valuations",
  "get_dashboard",
  "get_monthly_settlement",
  "get_annual_settlement",
  "get_budget_actuals",
  "get_annual_grid",
  "get_investment_summary",
] as const

export type RpcFunctionName = (typeof ALLOWED_RPC_FUNCTIONS)[number]

const ALLOWED_RPC_SET: ReadonlySet<string> = new Set(ALLOWED_RPC_FUNCTIONS)

/**
 * 객체/배열 파라미터는 postgres.js의 json 파라미터로 전달한다.
 * JSON.stringify 문자열로 보내면 jsonb 인자가 "문자열 스칼라"로 파싱되어
 * p->>'key' 조회가 전부 NULL이 되는 버그가 있다(통합 테스트로 회귀 방지).
 */
function toSqlValue(db: ReturnType<typeof getDb>, value: unknown): unknown {
  if (value !== null && typeof value === "object") {
    return db.json(value as Parameters<typeof db.json>[0])
  }
  return value
}

function normalizeError(error: unknown): RpcError {
  if (error instanceof RpcError) {
    return error
  }
  if (error instanceof Error) {
    const code =
      "code" in error && typeof error.code === "string" && error.code !== ""
        ? error.code
        : "RPC_ERROR"
    return new RpcError(code, error.message)
  }
  return new RpcError("RPC_ERROR", String(error))
}

/**
 * 단일 Postgres 함수(RPC) 호출 래퍼 (ARCHITECTURE.md §2, §4).
 * 모든 쓰기·집계는 `select public.<name>(named => args)` 1왕복으로 처리한다.
 */
export async function callRpc<T>(
  name: string,
  params: RpcParams = {},
): Promise<T> {
  if (!VALID_FUNCTION_NAME.test(name)) {
    throw new RpcError("INVALID_RPC_NAME", `Invalid RPC function name: ${name}`)
  }
  if (!ALLOWED_RPC_SET.has(name)) {
    throw new RpcError(
      "UNKNOWN_RPC_FUNCTION",
      `RPC function is not whitelisted: ${name}`,
    )
  }

  const keys = Object.keys(params)
  const invalidKey = keys.find((key) => !VALID_FUNCTION_NAME.test(key))
  if (invalidKey !== undefined) {
    throw new RpcError(
      "INVALID_RPC_PARAM",
      `Invalid RPC parameter name: ${invalidKey}`,
    )
  }
  const argList = keys.map((key, index) => `${key} => $${index + 1}`).join(", ")
  const query = `select public."${name}"(${argList}) as result`
  const db = getDb()
  const values = keys.map((key) => toSqlValue(db, params[key]))

  try {
    const rows = await db.unsafe(query, values as never[])
    return rows[0]?.result as T
  } catch (error) {
    throw normalizeError(error)
  }
}
