import { afterEach, describe, expect, test } from "vitest"

import { getTestDatabaseUrl } from "../../integration/helpers/db"

/**
 * 통합 테스트 DB 가드: TRUNCATE를 수행하므로 원격 호스트 연결은 반드시 차단해야 한다.
 * 단순 부분 문자열 매칭은 userinfo에 '@127.0.0.1:'을 심는 URL로 우회 가능 — 회귀 방지.
 */
describe("getTestDatabaseUrl", () => {
  afterEach(() => {
    delete process.env.TEST_DATABASE_URL
  })

  test("defaults to the local Supabase URL", () => {
    expect(getTestDatabaseUrl()).toBe(
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    )
  })

  test.each([
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    "postgresql://postgres:postgres@localhost:54322/postgres",
  ])("accepts local host url %s", (url) => {
    process.env.TEST_DATABASE_URL = url
    expect(getTestDatabaseUrl()).toBe(url)
  })

  test.each([
    "postgresql://user:pw@prod-host.example.com:5432/postgres",
    // userinfo에 '@127.0.0.1:'을 심어 부분 문자열 검사를 우회하는 URL —
    // 실제 접속 호스트는 evil-host.com
    "postgresql://postgres@127.0.0.1:1@evil-host.com:5432/postgres",
    "postgresql://user:pw%40localhost:@prod-host.example.com:5432/postgres",
  ])("rejects non-local url %s", (url) => {
    process.env.TEST_DATABASE_URL = url
    expect(() => getTestDatabaseUrl()).toThrow(/local database/)
  })
})
