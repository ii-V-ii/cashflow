import postgres from "postgres"

/**
 * 통합 테스트 전용 로컬 Supabase DB (supabase start, 포트 54322).
 * 안전 가드: 로컬 호스트가 아닌 DATABASE_URL로는 절대 실행하지 않는다
 * (TRUNCATE를 수행하므로 원격/운영 DB 연결은 치명적이다).
 */
const LOCAL_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

export function getTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL ?? LOCAL_DATABASE_URL
  // 부분 문자열 검사는 userinfo에 '@127.0.0.1:'을 심는 URL로 우회 가능 →
  // 반드시 URL 파서로 실제 접속 호스트를 비교한다.
  const { hostname } = new URL(url)
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    throw new Error(
      `Integration tests must target a local database (127.0.0.1/localhost). Got host: ${hostname}`,
    )
  }
  return url
}

export function createTestDb(): postgres.Sql {
  return postgres(getTestDatabaseUrl(), {
    prepare: false,
    max: 2,
    idle_timeout: 5,
    connect_timeout: 10,
  })
}

/** Phase 2A 예산 테이블 초기화 (budgets CASCADE → budget_items 동반 삭제) */
export async function truncateBudgets(sql: postgres.Sql): Promise<void> {
  await sql`TRUNCATE TABLE public.budget_items, public.budgets CASCADE`
}

/** 거래 코어 테이블 초기화 (FK CASCADE 포함) — Phase 2D부터 정기거래 테이블 포함 */
export async function truncateTransactionCore(sql: postgres.Sql): Promise<void> {
  await sql`
    TRUNCATE TABLE
      public.transaction_tags,
      public.transactions,
      public.recurring_transactions,
      public.tags,
      public.accounts,
      public.categories
    CASCADE
  `
}

/** Phase 2C 자산·투자 테이블 초기화 (accounts.asset_id FK 때문에 accounts 포함) */
export async function truncateAssetInvestmentCore(sql: postgres.Sql): Promise<void> {
  await sql`
    TRUNCATE TABLE
      public.investment_trades,
      public.asset_valuations,
      public.accounts,
      public.assets,
      public.asset_categories
    CASCADE
  `
}

/** Phase 2E 예측 테이블 초기화 (results는 scenario FK CASCADE) */
export async function truncateForecast(sql: postgres.Sql): Promise<void> {
  await sql`
    TRUNCATE TABLE
      public.forecast_results,
      public.forecast_scenarios
    CASCADE
  `
}
