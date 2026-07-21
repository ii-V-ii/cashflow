import { expect, type Page } from "@playwright/test"
import postgres from "postgres"

import { E2E_USER, LOCAL_SUPABASE } from "../../playwright.config"

/**
 * E2E 공용 헬퍼 — 시드 초기화(멱등)·로그인·잔액 조회.
 * 시드: E2E은행 100,000원 / E2E적금 0원, 카테고리 식비·저축(saving)·급여.
 */
/** 부모 카테고리 아래 소분류 1개 삽입 — resetSeedData와 동일한 로컬 호스트 가드 적용 */
export async function seedChildCategory(
  parentName: string,
  childName: string,
): Promise<void> {
  const { hostname } = new URL(LOCAL_SUPABASE.databaseUrl)
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    throw new Error(`E2E must target a local database. Got host: ${hostname}`)
  }

  const sql = postgres(LOCAL_SUPABASE.databaseUrl, { prepare: false, max: 1 })
  try {
    await sql`
      INSERT INTO public.categories (name, type, expense_kind, parent_id, sort_order)
      SELECT ${childName}, type, expense_kind, id, 0
      FROM public.categories WHERE name = ${parentName} AND parent_id IS NULL
    `
  } finally {
    await sql.end()
  }
}

/**
 * 월 원장 100건 초과 회귀 시나리오용 벌크 시드 — SQL 직접 insert (UI 반복 클릭 금지).
 * i=0 거래만 해당 월의 1일에 꽂아 "월초 거래"로 식별 가능하게 하고, 나머지는 2일부터
 * 순환 배치해 날짜가 겹치지 않도록 한다. resetSeedData/seedChildCategory와 동일한
 * 로컬 호스트 가드를 공유한다.
 */
export async function seedTransactions(
  count: number,
  ym: string,
  options: { accountName?: string; categoryName?: string; amount?: number } = {},
): Promise<{ total: number; earliestDescription: string }> {
  const { hostname } = new URL(LOCAL_SUPABASE.databaseUrl)
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    throw new Error(`E2E must target a local database. Got host: ${hostname}`)
  }

  const accountName = options.accountName ?? "E2E은행"
  const categoryName = options.categoryName ?? "식비"
  const amount = options.amount ?? 1000
  const earliestDescription = "월초 회귀 거래"

  const sql = postgres(LOCAL_SUPABASE.databaseUrl, { prepare: false, max: 1 })
  try {
    const [account] = await sql`
      SELECT id FROM public.accounts WHERE name = ${accountName} LIMIT 1
    `
    const [category] = await sql`
      SELECT id FROM public.categories
      WHERE name = ${categoryName} AND parent_id IS NULL LIMIT 1
    `
    if (!account || !category) {
      throw new Error(
        `seedTransactions: 계좌(${accountName})/카테고리(${categoryName})를 찾을 수 없습니다 — resetSeedData를 먼저 호출하세요.`,
      )
    }

    const [year, month] = ym.split("-").map(Number)
    const lastDay = new Date(year, month, 0).getDate()

    const rows = Array.from({ length: count }, (_, i) => {
      const day = i === 0 ? 1 : 2 + ((i - 1) % Math.max(lastDay - 1, 1))
      return {
        type: "expense" as const,
        amount,
        description: i === 0 ? earliestDescription : `시드거래${i}`,
        category_id: category.id as string,
        account_id: account.id as string,
        date: `${ym}-${String(day).padStart(2, "0")}`,
      }
    })

    await sql`
      INSERT INTO public.transactions ${sql(
        rows,
        "type",
        "amount",
        "description",
        "category_id",
        "account_id",
        "date",
      )}
    `
  } finally {
    await sql.end()
  }

  return { total: count * amount, earliestDescription }
}

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
        public.investment_trades, public.asset_valuations,
        public.assets, public.asset_categories,
        public.tags, public.accounts, public.categories,
        public.forecast_results, public.forecast_scenarios
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
