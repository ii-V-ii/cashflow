import type postgres from "postgres"

/**
 * 프로덕션 시작 가드 (DB-C1/DB-C2): 접속 롤이 슈퍼유저면
 * - production: 즉시 throw (기동 중단 — 제한 롤로 재구성해야 한다)
 * - 로컬/테스트: 경고 로그만 (로컬 Supabase의 postgres 롤은 테이블 소유자이지만
 *   슈퍼유저가 아니므로 통상 경고도 발생하지 않는다)
 *
 * 실질 인가 경계는 guarded()(세션+소유자 검증)이며, 이 가드는 운영 DB에
 * 과도 권한 롤로 직결되는 구성 실수를 기동 시점에 차단하는 방어 계층이다.
 */
export async function assertSafeDatabaseRole(
  sql: postgres.Sql,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): Promise<void> {
  const rows = await sql`
    SELECT current_setting('is_superuser') AS is_superuser,
           session_user AS session_user
  `
  const isSuperuser = rows[0]?.is_superuser === "on"
  if (!isSuperuser) {
    return
  }

  const message =
    `[db] 슈퍼유저(session_user=${rows[0]?.session_user})로 데이터베이스에 접속했습니다. ` +
    "프로덕션에서는 슈퍼유저 접속을 금지합니다 — DATABASE_URL을 제한 롤로 변경하세요."

  if (nodeEnv === "production") {
    throw new Error(message)
  }
  console.warn(message)
}
