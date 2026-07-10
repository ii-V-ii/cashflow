import "server-only"

import postgres from "postgres"

import { assertSafeDatabaseRole } from "@/server/db/role-guard"

/**
 * Supabase transaction-mode pooler (port 6543) 연결 (ARCHITECTURE.md §8).
 * - prepare: false — transaction pooler는 prepared statement 미지원
 * - max: 1 — 서버리스 함수 인스턴스당 1 커넥션 (다중화는 pooler 담당)
 */
let client: postgres.Sql | undefined

export function getDb(): postgres.Sql {
  if (!client) {
    const url = process.env.DATABASE_URL
    if (!url) {
      throw new Error("DATABASE_URL environment variable is not set")
    }
    client = postgres(url, {
      prepare: false,
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
    })
    // 프로덕션 시작 가드(DB-C1/DB-C2): 슈퍼유저 접속이면 즉시 기동 실패(fail-fast).
    // getDb()는 동기 API를 유지해야 하므로 커넥션당 1회 비동기 검증으로 수행한다.
    void assertSafeDatabaseRole(client).catch((error) => {
      console.error("[db] 접속 롤 검증 실패:", error)
      if (process.env.NODE_ENV === "production") {
        process.exit(1)
      }
    })
  }
  return client
}

/**
 * 싱글턴 커넥션 종료 + 초기화 (테스트 teardown 용).
 * 초기화하지 않으면 다음 getDb() 호출이 닫힌 클라이언트를 반환한다.
 */
export async function closeDb(): Promise<void> {
  if (client) {
    await client.end()
    client = undefined
  }
}
