import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const getAuthUserMock = vi.fn()

vi.mock("@/server/auth", () => ({
  getAuthUser: (...args: unknown[]) => getAuthUserMock(...args),
}))

import { ApiError } from "@/server/api-errors"
import { guarded } from "@/server/api-guard"

const OWNER_EMAIL = "owner@local.test"

beforeEach(() => {
  getAuthUserMock.mockReset()
  vi.stubEnv("OWNER_EMAIL", OWNER_EMAIL)
})

afterEach(() => {
  vi.unstubAllEnvs()
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
    getAuthUserMock.mockResolvedValue({ id: "u1", email: OWNER_EMAIL })
    const handler = vi.fn(async () => Response.json({ success: true, data: 1 }))

    const response = await guarded(handler)

    expect(handler).toHaveBeenCalledWith({ id: "u1", email: OWNER_EMAIL })
    expect(response.status).toBe(200)
  })

  test("maps thrown ApiError to error envelope", async () => {
    getAuthUserMock.mockResolvedValue({ id: "u1", email: OWNER_EMAIL })

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
    getAuthUserMock.mockResolvedValue({ id: "u1", email: OWNER_EMAIL })
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

  describe("소유자 검증 (SEC-H1: 세션 + 소유자 이메일 이중 가드)", () => {
    test("returns 403 FORBIDDEN when authenticated email is not the owner", async () => {
      getAuthUserMock.mockResolvedValue({ id: "u2", email: "intruder@evil.test" })
      const handler = vi.fn(async () => Response.json({ ok: true }))

      const response = await guarded(handler)

      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({
        success: false,
        error: { code: "FORBIDDEN", message: "접근 권한이 없습니다" },
      })
      expect(handler).not.toHaveBeenCalled()
    })

    test("returns 403 FORBIDDEN when authenticated user has no email", async () => {
      getAuthUserMock.mockResolvedValue({ id: "u3", email: null })

      const response = await guarded(async () => Response.json({ ok: true }))

      expect(response.status).toBe(403)
    })

    test("fail-closed: returns 500 and logs when OWNER_EMAIL is not configured", async () => {
      vi.stubEnv("OWNER_EMAIL", "")
      getAuthUserMock.mockResolvedValue({ id: "u1", email: OWNER_EMAIL })
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      const handler = vi.fn(async () => Response.json({ ok: true }))

      const response = await guarded(handler)

      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.error.code).toBe("INTERNAL_ERROR")
      expect(handler).not.toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("OWNER_EMAIL"),
      )
      consoleSpy.mockRestore()
    })
  })
})
