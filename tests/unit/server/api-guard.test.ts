import { beforeEach, describe, expect, test, vi } from "vitest"

const getAuthUserMock = vi.fn()

vi.mock("@/server/auth", () => ({
  getAuthUser: (...args: unknown[]) => getAuthUserMock(...args),
}))

import { ApiError } from "@/server/api-errors"
import { guarded } from "@/server/api-guard"

beforeEach(() => {
  getAuthUserMock.mockReset()
})

describe("guarded", () => {
  test("returns 401 envelope when unauthenticated", async () => {
    getAuthUserMock.mockResolvedValue(null)

    const response = await guarded(async () => Response.json({ ok: true }))

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      success: false,
      error: { code: "UNAUTHORIZED", message: "로그인이 필요합니다" },
    })
  })

  test("invokes handler with the auth user", async () => {
    getAuthUserMock.mockResolvedValue({ id: "u1", email: "a@b.c" })
    const handler = vi.fn(async () => Response.json({ success: true, data: 1 }))

    const response = await guarded(handler)

    expect(handler).toHaveBeenCalledWith({ id: "u1", email: "a@b.c" })
    expect(response.status).toBe(200)
  })

  test("maps thrown ApiError to error envelope", async () => {
    getAuthUserMock.mockResolvedValue({ id: "u1", email: null })

    const response = await guarded(async () => {
      throw new ApiError(409, "REFERENCE_EXISTS", "참조 중")
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      success: false,
      error: { code: "REFERENCE_EXISTS", message: "참조 중" },
    })
  })

  test("hides internal error details", async () => {
    getAuthUserMock.mockResolvedValue({ id: "u1", email: null })
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const response = await guarded(async () => {
      throw new Error("password=hunter2")
    })

    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body.error.code).toBe("INTERNAL_ERROR")
    expect(JSON.stringify(body)).not.toContain("hunter2")
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
