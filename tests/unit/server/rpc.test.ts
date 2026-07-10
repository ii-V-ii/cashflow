import { beforeEach, describe, expect, test, vi } from "vitest"

const unsafeMock = vi.fn()
const jsonMock = vi.fn((value: unknown) => ({ __jsonParam: value }))

vi.mock("@/server/db/client", () => ({
  getDb: () => ({ unsafe: unsafeMock, json: jsonMock }),
}))

import { ALLOWED_RPC_FUNCTIONS, callRpc, RpcError } from "@/server/rpc"

beforeEach(() => {
  unsafeMock.mockReset()
  jsonMock.mockClear()
})

describe("callRpc", () => {
  test("calls the named function with named arguments and returns the result", async () => {
    // Arrange
    unsafeMock.mockResolvedValueOnce([{ result: { id: "tx-1", amount: 1000 } }])

    // Act
    const result = await callRpc<{ id: string; amount: number }>(
      "create_transaction",
      { p: { amount: 1000 } },
    )

    // Assert
    expect(result).toEqual({ id: "tx-1", amount: 1000 })
    expect(unsafeMock).toHaveBeenCalledTimes(1)
    const [query, values] = unsafeMock.mock.calls[0]
    expect(query).toBe('select public."create_transaction"(p => $1) as result')
    // 객체/배열 파라미터는 JSON.stringify 문자열이 아니라 postgres.js json 파라미터로
    // 전달해야 한다 — 문자열로 보내면 jsonb 문자열 스칼라로 파싱되는 회귀 방지.
    expect(values).toEqual([{ __jsonParam: { amount: 1000 } }])
    expect(jsonMock).toHaveBeenCalledWith({ amount: 1000 })
  })

  test("passes scalar parameters through without json wrapping", async () => {
    unsafeMock.mockResolvedValueOnce([{ result: true }])

    await callRpc<boolean>("delete_transaction", { p_id: "uuid-1" })

    const [query, values] = unsafeMock.mock.calls[0]
    expect(query).toBe('select public."delete_transaction"(p_id => $1) as result')
    expect(values).toEqual(["uuid-1"])
    expect(jsonMock).not.toHaveBeenCalled()
  })

  test("wraps array parameters as json parameters", async () => {
    unsafeMock.mockResolvedValueOnce([{ result: null }])

    await callRpc("update_transaction", { p_id: "uuid-1", p: { tags: ["a"] } })

    const [, values] = unsafeMock.mock.calls[0]
    expect(values).toEqual(["uuid-1", { __jsonParam: { tags: ["a"] } }])
  })

  test("calls a zero-argument function without parameters", async () => {
    unsafeMock.mockResolvedValueOnce([{ result: 3 }])

    const result = await callRpc<number>("process_due_transactions")

    expect(result).toBe(3)
    const [query, values] = unsafeMock.mock.calls[0]
    expect(query).toBe('select public."process_due_transactions"() as result')
    expect(values).toEqual([])
  })

  test("normalizes postgres errors into RpcError with { code, message }", async () => {
    const pgError = Object.assign(new Error("insufficient lot quantity"), {
      code: "P0001",
    })
    unsafeMock.mockRejectedValueOnce(pgError)

    const promise = callRpc("create_investment_trade", { p: {} })

    await expect(promise).rejects.toBeInstanceOf(RpcError)
    await expect(promise).rejects.toMatchObject({
      code: "P0001",
      message: "insufficient lot quantity",
    })
  })

  test("uses RPC_ERROR code when the underlying error has no code", async () => {
    unsafeMock.mockRejectedValueOnce(new Error("connection refused"))

    await expect(callRpc("get_dashboard", { p_year: 2026 })).rejects.toMatchObject({
      code: "RPC_ERROR",
      message: "connection refused",
    })
  })

  test("rejects invalid parameter names without touching the database", async () => {
    await expect(
      callRpc("create_transaction", { "p) --": 1 }),
    ).rejects.toMatchObject({ code: "INVALID_RPC_PARAM" })
    expect(unsafeMock).not.toHaveBeenCalled()
  })

  test("rejects invalid function names without touching the database", async () => {
    await expect(
      callRpc("create_transaction; drop table transactions"),
    ).rejects.toMatchObject({ code: "INVALID_RPC_NAME" })
    expect(unsafeMock).not.toHaveBeenCalled()
  })

  test("rejects well-formed but non-whitelisted function names", async () => {
    await expect(callRpc("pg_sleep")).rejects.toMatchObject({
      code: "UNKNOWN_RPC_FUNCTION",
    })
    expect(unsafeMock).not.toHaveBeenCalled()
  })

  test("whitelist covers the transaction RPCs (DB.md §5 GRANT list)", () => {
    expect(ALLOWED_RPC_FUNCTIONS).toContain("create_transaction")
    expect(ALLOWED_RPC_FUNCTIONS).toContain("update_transaction")
    expect(ALLOWED_RPC_FUNCTIONS).toContain("delete_transaction")
  })

  test("whitelist covers the budget RPCs (Phase 2A, API.md §6)", () => {
    expect(ALLOWED_RPC_FUNCTIONS).toContain("create_budget")
    expect(ALLOWED_RPC_FUNCTIONS).toContain("update_budget")
    expect(ALLOWED_RPC_FUNCTIONS).toContain("copy_budget")
    expect(ALLOWED_RPC_FUNCTIONS).toContain("upsert_budget_cell")
    expect(ALLOWED_RPC_FUNCTIONS).toContain("get_budget_actuals")
    expect(ALLOWED_RPC_FUNCTIONS).toContain("get_annual_grid")
    expect(ALLOWED_RPC_FUNCTIONS).toContain("get_budget_summary")
  })

  test("whitelist covers the recurring RPCs (Phase 2D, API.md §12)", () => {
    expect(ALLOWED_RPC_FUNCTIONS).toContain("create_recurring")
    expect(ALLOWED_RPC_FUNCTIONS).toContain("update_recurring")
    expect(ALLOWED_RPC_FUNCTIONS).toContain("delete_recurring")
    expect(ALLOWED_RPC_FUNCTIONS).toContain("process_due_transactions")
    // 내부 헬퍼는 REST 경로에서 직접 호출 불가
    expect(ALLOWED_RPC_FUNCTIONS).not.toContain("refill_recurring_pending")
  })
})
