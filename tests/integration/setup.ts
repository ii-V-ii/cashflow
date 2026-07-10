import { getTestDatabaseUrl } from "./helpers/db"

/**
 * 통합 테스트 셋업: callRpc(getDb)가 반드시 로컬 Supabase(54322)로 연결되도록
 * DATABASE_URL을 테스트 시작 전에 고정한다.
 * (.env.local의 원격 DATABASE_URL이 셸 환경에 노출되어 있어도 무시된다.)
 */
process.env.DATABASE_URL = getTestDatabaseUrl()
