import { defineConfig, devices } from "@playwright/test"

// 로컬 개발 서버(3000)와 충돌하지 않는 E2E 전용 포트
const PORT = 3100

/**
 * E2E는 반드시 로컬 Supabase(supabase start) 대상 —
 * .env.local의 원격 값보다 프로세스 env가 우선하므로 여기서 강제 고정한다.
 * 아래 키는 Supabase CLI 로컬 스택의 공개 데모 키다(시크릿 아님).
 */
export const LOCAL_SUPABASE = {
  url: "http://127.0.0.1:54321",
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
  serviceRoleKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
  databaseUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
} as const

export const E2E_USER = {
  email: "owner@local.test",
  password: "cashflow-e2e-password",
} as const

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false, // 단일 로컬 DB 공유 — 직렬 실행
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html"], ["github"]] : "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // CI는 사전 pnpm build 후 start, 로컬은 dev 서버 기동
    command: process.env.CI
      ? `pnpm start --port ${PORT}`
      : `pnpm dev --port ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: LOCAL_SUPABASE.databaseUrl,
      NEXT_PUBLIC_SUPABASE_URL: LOCAL_SUPABASE.url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: LOCAL_SUPABASE.anonKey,
      SUPABASE_SERVICE_ROLE_KEY: LOCAL_SUPABASE.serviceRoleKey,
    },
  },
})
