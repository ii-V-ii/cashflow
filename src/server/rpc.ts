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

function toSqlValue(value: unknown): unknown {
  if (value !== null && typeof value === "object") {
    return JSON.stringify(value)
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
  const values = keys.map((key) => toSqlValue(params[key]))

  try {
    const rows = await getDb().unsafe(query, values as never[])
    return rows[0]?.result as T
  } catch (error) {
    throw normalizeError(error)
  }
}
