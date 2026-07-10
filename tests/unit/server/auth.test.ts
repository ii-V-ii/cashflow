import { beforeEach, describe, expect, test, vi } from "vitest"

const getUserMock = vi.fn()

vi.mock("@/server/supabase", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
  })),
}))

import { getAuthUser } from "@/server/auth"

beforeEach(() => {
  getUserMock.mockReset()
})

describe("getAuthUser", () => {
  test("returns id/email when a session user exists", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1", email: "owner@local.test" } },
      error: null,
    })

    await expect(getAuthUser()).resolves.toEqual({
      id: "user-1",
      email: "owner@local.test",
    })
  })

  test("returns null when there is no user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null })
    await expect(getAuthUser()).resolves.toBeNull()
  })

  test("returns null on supabase error", async () => {
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: { message: "invalid JWT" },
    })
    await expect(getAuthUser()).resolves.toBeNull()
  })

  test("returns null when client creation throws (요청 컨텍스트 밖)", async () => {
    getUserMock.mockRejectedValue(new Error("cookies outside request scope"))
    await expect(getAuthUser()).resolves.toBeNull()
  })
})
