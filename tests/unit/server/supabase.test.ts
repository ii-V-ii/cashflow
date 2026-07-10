import { beforeEach, describe, expect, test, vi } from "vitest"

const cookieStore = {
  getAll: vi.fn(() => [{ name: "sb", value: "token" }]),
  set: vi.fn(),
}

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => cookieStore),
}))

const createServerClientMock = vi.fn(() => ({ auth: {} }))

vi.mock("@supabase/ssr", () => ({
  createServerClient: (...args: unknown[]) =>
    (createServerClientMock as (...a: unknown[]) => unknown)(...args),
}))

import { createSupabaseServerClient } from "@/server/supabase"

beforeEach(() => {
  createServerClientMock.mockClear()
  cookieStore.set.mockClear()
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321"
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key"
})

describe("createSupabaseServerClient", () => {
  test("wires cookie getAll/setAll adapters", async () => {
    await createSupabaseServerClient()

    expect(createServerClientMock).toHaveBeenCalledTimes(1)
    const [url, key, options] = createServerClientMock.mock.calls[0] as unknown as [
      string,
      string,
      { cookies: { getAll: () => unknown; setAll: (v: unknown[]) => void } },
    ]
    expect(url).toBe("http://127.0.0.1:54321")
    expect(key).toBe("anon-key")
    expect(options.cookies.getAll()).toEqual([{ name: "sb", value: "token" }])

    options.cookies.setAll([{ name: "sb", value: "next", options: {} }])
    expect(cookieStore.set).toHaveBeenCalledWith("sb", "next", {})
  })

  test("throws when env vars are missing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    await expect(createSupabaseServerClient()).rejects.toThrow(
      "NEXT_PUBLIC_SUPABASE_URL",
    )
  })
})
