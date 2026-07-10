import { E2E_USER, LOCAL_SUPABASE } from "../../playwright.config"
import { resetSeedData } from "./helpers"

/**
 * E2E 전역 셋업 — 로컬 Supabase 대상:
 * 1) 시드 사용자 생성(멱등)  2) 거래 코어 테이블 초기화 + 시드 계좌/카테고리
 */
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

export default async function globalSetup(): Promise<void> {
  await createSeedUser()
  await resetSeedData()
}
