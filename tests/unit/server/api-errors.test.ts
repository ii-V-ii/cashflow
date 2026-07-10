import { describe, expect, test } from "vitest"
import { z } from "zod"

import { ApiError, mapApiError } from "@/server/api-errors"
import { RpcError } from "@/server/rpc"

function pgError(code: string, message = "db error"): Error & { code: string } {
  const error = new Error(message) as Error & { code: string }
  error.code = code
  return error
}

describe("mapApiError (API.md §16 에러 코드 일람)", () => {
  test("ApiError passes through as-is", () => {
    const mapped = mapApiError(new ApiError(404, "NOT_FOUND", "계좌 없음"))
    expect(mapped).toEqual({ status: 404, code: "NOT_FOUND", message: "계좌 없음" })
  })

  test("ZodError → 400 VALIDATION_ERROR with first issue message", () => {
    const result = z.object({ name: z.string().min(1, "이름 필수") }).safeParse({ name: "" })
    expect(result.success).toBe(false)
    if (!result.success) {
      const mapped = mapApiError(result.error)
      expect(mapped.status).toBe(400)
      expect(mapped.code).toBe("VALIDATION_ERROR")
      expect(mapped.message).toContain("이름 필수")
    }
  })

  test("FK violation(23503) → 404 NOT_FOUND by default (생성 시 참조 대상 없음)", () => {
    const mapped = mapApiError(pgError("23503"))
    expect(mapped.status).toBe(404)
    expect(mapped.code).toBe("NOT_FOUND")
  })

  test("FK violation(23503) → 409 REFERENCE_EXISTS when fkMeansReference", () => {
    const mapped = mapApiError(pgError("23503"), { fkMeansReference: true })
    expect(mapped.status).toBe(409)
    expect(mapped.code).toBe("REFERENCE_EXISTS")
  })

  test("CHECK violation(23514) → 400 VALIDATION_ERROR", () => {
    expect(mapApiError(pgError("23514")).status).toBe(400)
  })

  test("invalid uuid(22P02) → 400 VALIDATION_ERROR", () => {
    expect(mapApiError(pgError("22P02")).code).toBe("VALIDATION_ERROR")
  })

  test("저축 거래 RPC 검증(P0001, 입금 계좌 메시지) → 422 SAVING_CATEGORY_REQUIRED", () => {
    const mapped = mapApiError(
      new RpcError("P0001", "저축 거래는 입금 계좌(to_account_id)가 필요합니다"),
    )
    expect(mapped.status).toBe(422)
    expect(mapped.code).toBe("SAVING_CATEGORY_REQUIRED")
  })

  test("TRANSACTION_NOT_FOUND(P0001) → 404 NOT_FOUND", () => {
    const mapped = mapApiError(new RpcError("P0001", "TRANSACTION_NOT_FOUND"))
    expect(mapped.status).toBe(404)
    expect(mapped.code).toBe("NOT_FOUND")
  })

  test("unknown error → 500 INTERNAL_ERROR without leaking details", () => {
    const mapped = mapApiError(new Error("secret connection string leaked"))
    expect(mapped.status).toBe(500)
    expect(mapped.code).toBe("INTERNAL_ERROR")
    expect(mapped.message).not.toContain("secret")
  })
})
