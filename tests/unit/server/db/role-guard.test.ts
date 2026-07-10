import { afterEach, describe, expect, test, vi } from "vitest"

import { assertSafeDatabaseRole } from "@/server/db/role-guard"

type FakeRow = { is_superuser: string; session_user: string }

/** postgres.js 태그드 템플릿 시그니처를 흉내내는 mock sql */
function fakeSql(row: FakeRow) {
  return vi.fn(async () => [row]) as unknown as Parameters<
    typeof assertSafeDatabaseRole
  >[0]
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("assertSafeDatabaseRole (DB-C1/DB-C2: 프로덕션 슈퍼유저 접속 차단)", () => {
  test("production + superuser → throws with a clear message", async () => {
    const sql = fakeSql({ is_superuser: "on", session_user: "postgres" })

    await expect(
      assertSafeDatabaseRole(sql, "production"),
    ).rejects.toThrowError(/슈퍼유저/)
  })

  test("production + non-superuser → resolves silently", async () => {
    const sql = fakeSql({ is_superuser: "off", session_user: "app_user" })
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    await expect(
      assertSafeDatabaseRole(sql, "production"),
    ).resolves.toBeUndefined()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  test("non-production + superuser → warns but does not throw", async () => {
    const sql = fakeSql({ is_superuser: "on", session_user: "postgres" })
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    await expect(
      assertSafeDatabaseRole(sql, "test"),
    ).resolves.toBeUndefined()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("슈퍼유저"),
    )
  })

  test("non-production + non-superuser → no warning", async () => {
    const sql = fakeSql({ is_superuser: "off", session_user: "postgres" })
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    await assertSafeDatabaseRole(sql, "development")
    expect(warnSpy).not.toHaveBeenCalled()
  })
})
