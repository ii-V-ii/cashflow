import { afterEach, describe, expect, test, vi } from "vitest"

import { ApiClientError, apiFetch } from "@/lib/api/http"

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }))
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("apiFetch", () => {
  test("returns data from a success envelope", async () => {
    mockFetch(200, { success: true, data: { id: "1" } })
    await expect(apiFetch("/api/v1/accounts")).resolves.toEqual({ id: "1" })
  })

  test("sets content-type only when a body exists", async () => {
    const fetchMock = mockFetch(200, { success: true, data: null })
    await apiFetch("/x", { method: "POST", body: "{}" })
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>)["content-type"]).toBe(
      "application/json",
    )
  })

  test("throws ApiClientError with server error code", async () => {
    mockFetch(409, {
      success: false,
      error: { code: "REFERENCE_EXISTS", message: "참조 중" },
    })
    const error = await apiFetch("/x").catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiClientError)
    expect((error as ApiClientError).code).toBe("REFERENCE_EXISTS")
    expect((error as ApiClientError).status).toBe(409)
  })

  test("throws UNKNOWN_ERROR when body is not json", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("not json")
      },
    }))
    vi.stubGlobal("fetch", fetchMock)
    const error = await apiFetch("/x").catch((e: unknown) => e)
    expect((error as ApiClientError).code).toBe("UNKNOWN_ERROR")
  })
})
