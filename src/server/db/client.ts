import "server-only"

import postgres from "postgres"

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
