import postgres from "postgres"

import { E2E_USER, LOCAL_SUPABASE } from "../../playwright.config"

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

async function seedDatabase(): Promise<void> {
  const { hostname } = new URL(LOCAL_SUPABASE.databaseUrl)
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    throw new Error(`E2E must target a local database. Got host: ${hostname}`)
  }

  const sql = postgres(LOCAL_SUPABASE.databaseUrl, { prepare: false, max: 1 })
  try {
    await sql`
      TRUNCATE TABLE
        public.transaction_tags, public.transactions,
        public.tags, public.accounts, public.categories
      CASCADE
    `
    await sql`
      INSERT INTO public.accounts (name, type, initial_balance, sort_order) VALUES
        ('E2E은행', 'bank', 100000, 0),
        ('E2E적금', 'savings', 0, 1)
    `
    await sql`
      INSERT INTO public.categories (name, type, expense_kind, sort_order) VALUES
        ('식비', 'expense', 'consumption', 0),
        ('저축', 'expense', 'saving', 1),
        ('급여', 'income', NULL, 0)
    `
  } finally {
    await sql.end()
  }
}

export default async function globalSetup(): Promise<void> {
  await createSeedUser()
  await seedDatabase()
}
