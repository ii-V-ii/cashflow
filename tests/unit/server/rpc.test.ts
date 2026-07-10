import { beforeEach, describe, expect, test, vi } from "vitest"

const unsafeMock = vi.fn()

vi.mock("@/server/db/client", () => ({
  getDb: () => ({ unsafe: unsafeMock }),
}))

import { callRpc, RpcError } from "@/server/rpc"

beforeEach(() => {
  unsafeMock.mockReset()
})

describe("callRpc", () => {
  test("calls the named function with named arguments and returns the result", async () => {
    // Arrange
    unsafeMock.mockResolvedValueOnce([{ result: { id: "tx-1", amount: 1000 } }])

    // Act
    const result = await callRpc<{ id: string; amount: number }>(
      "create_transaction",
      { p_payload: { amount: 1000 } },
    )

    // Assert
    expect(result).toEqual({ id: "tx-1", amount: 1000 })
    expect(unsafeMock).toHaveBeenCalledTimes(1)
    const [query, values] = unsafeMock.mock.calls[0]
    expect(query).toBe(
      'select public."create_transaction"(p_payload => $1) as result',
    )
    expect(values).toEqual([JSON.stringify({ amount: 1000 })])
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

    const promise = callRpc("create_investment_trade", { p_payload: {} })

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
      callRpc("create_transaction", { "p_payload) --": 1 }),
    ).rejects.toMatchObject({ code: "INVALID_RPC_PARAM" })
    expect(unsafeMock).not.toHaveBeenCalled()
  })

  test("rejects invalid function names without touching the database", async () => {
    await expect(
      callRpc("create_transaction; drop table transactions"),
    ).rejects.toMatchObject({ code: "INVALID_RPC_NAME" })
    expect(unsafeMock).not.toHaveBeenCalled()
  })
})
