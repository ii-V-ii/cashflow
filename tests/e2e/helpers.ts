import { expect, type Page } from "@playwright/test"
import postgres from "postgres"

import { E2E_USER, LOCAL_SUPABASE } from "../../playwright.config"

/**
 * E2E 공용 헬퍼 — 시드 초기화(멱등)·로그인·잔액 조회.
 * 시드: E2E은행 100,000원 / E2E적금 0원, 카테고리 식비·저축(saving)·급여.
 */
export async function resetSeedData(): Promise<void> {
  const { hostname } = new URL(LOCAL_SUPABASE.databaseUrl)
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    throw new Error(`E2E must target a local database. Got host: ${hostname}`)
  }

  const sql = postgres(LOCAL_SUPABASE.databaseUrl, { prepare: false, max: 1 })
  try {
    await sql`
      TRUNCATE TABLE
        public.budget_items, public.budgets,
        public.transaction_tags, public.transactions,
        public.recurring_transactions,
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

export async function login(page: Page): Promise<void> {
  await page.goto("/")
  await page.waitForURL("**/login")
  await page.getByLabel("이메일").fill(E2E_USER.email)
  await page.getByLabel("비밀번호").fill(E2E_USER.password)
  await page.getByRole("button", { name: "로그인" }).click()
  await page.waitForURL((url) => new URL(url).pathname === "/")
}

/** /accounts로 이동해 지정 계좌들의 잔액 텍스트를 한 번에 읽는다 */
export async function readAccountBalances(
  page: Page,
  names: readonly string[],
): Promise<Record<string, string>> {
  await page.goto("/accounts")
  const balances: Record<string, string> = {}
  for (const name of names) {
    const balance = page.getByTestId(`account-balance-${name}`)
    await expect(balance).toBeVisible()
    balances[name] = (await balance.textContent()) ?? ""
  }
  return balances
}
