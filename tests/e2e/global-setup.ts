import { E2E_PORT, E2E_USER, LOCAL_SUPABASE } from "../../playwright.config"
import { resetSeedData } from "./helpers"

/**
 * E2E 전역 셋업 — 로컬 Supabase 대상:
 * 1) GoTrue health 200 대기  2) 시드 사용자 생성(멱등)
 * 3) 거래 코어 테이블 초기화 + 시드 계좌/카테고리
 */

const AUTH_HEALTH_TIMEOUT_MS = 60_000
const AUTH_HEALTH_RETRY_DELAY_MS = 1_000

/**
 * supabase db reset 직후 GoTrue 재기동 구간에는 admin API가 502를 돌려준다 —
 * /auth/v1/health 가 200이 될 때까지 대기해 셋업 플레이크를 제거한다.
 */
async function waitForAuthHealth(): Promise<void> {
  const deadline = Date.now() + AUTH_HEALTH_TIMEOUT_MS
  let lastError = "unknown"

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${LOCAL_SUPABASE.url}/auth/v1/health`, {
        headers: { apikey: LOCAL_SUPABASE.anonKey },
      })
      if (response.ok) return
      lastError = `HTTP ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await new Promise((resolve) => setTimeout(resolve, AUTH_HEALTH_RETRY_DELAY_MS))
  }

  throw new Error(
    `GoTrue가 ${AUTH_HEALTH_TIMEOUT_MS / 1000}초 내에 준비되지 않았습니다 (마지막 응답: ${lastError})`,
  )
}

async function createSeedUser(): Promise<void> {
  const response = await fetch(`${LOCAL_SUPABASE.url}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: LOCAL_SUPABASE.serviceRoleKey,
      authorization: `Bearer ${LOCAL_SUPABASE.serviceRoleKey}`,
    },
    body: JSON.stringify({
      email: E2E_USER.email,
      password: E2E_USER.password,
      email_confirm: true,
    }),
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error_code?: string
      msg?: string
    }
    // 이미 존재하면 멱등 통과
    if (body.error_code === "email_exists" || response.status === 422) {
      return
    }
    throw new Error(
      `E2E 시드 사용자 생성 실패 (${response.status}): ${body.msg ?? "unknown"}`,
    )
  }
}

/** 워밍업 대상 라우트 — 페이지 + 첫 상호작용에 쓰이는 API */
const WARMUP_PATHS = [
  "/login",
  "/",
  "/transactions",
  "/budgets",
  "/accounts",
  "/settlements",
  "/reports",
  "/api/v1/health",
  "/api/v1/transactions",
  "/api/v1/budgets",
  "/api/v1/dashboard",
] as const

/**
 * 로컬 dev 서버 워밍업 — 온디맨드 컴파일을 테스트 시작 전에 끝내
 * 첫 테스트 중 Fast Refresh 전체 리로드로 폼 상호작용이 끊기는 플레이크를 제거한다.
 * (CI는 프로덕션 빌드(pnpm start)라 해당 없음 — 호출 자체는 무해)
 */
async function warmUpAppRoutes(): Promise<void> {
  const baseUrl = `http://localhost:${E2E_PORT}`
  for (const path of WARMUP_PATHS) {
    // 미인증 200/3xx/401 전부 무방 — 라우트 컴파일 트리거가 목적
    await fetch(`${baseUrl}${path}`, { redirect: "manual" }).catch(() => undefined)
  }
}

export default async function globalSetup(): Promise<void> {
  await waitForAuthHealth()
  await createSeedUser()
  await resetSeedData()
  await warmUpAppRoutes()
}
