import { expect, test, type Page } from "@playwright/test"
import postgres from "postgres"

import { LOCAL_SUPABASE } from "../../playwright.config"
import { login, readAccountBalances, resetSeedData } from "./helpers"

/**
 * Phase 1 QA 보강 시나리오:
 * (a) 이체 → 두 계좌 잔액 동시 반영
 * (b) 저축(지출+saving 카테고리+입금 계좌) → 출금·입금 계좌 잔액
 * (c) 거래 수정(금액 변경) → 잔액 재계산
 * (d) 검증 실패(금액 0/음수) → 에러 표시·요청 미발생, 서버는 400
 * (e) 모바일(375px) 하단 탭 + 빠른 입력 시트
 * 시드: E2E은행 100,000원 / E2E적금 0원 (helpers.resetSeedData)
 */

const ACCOUNTS = ["E2E은행", "E2E적금"] as const

function todayString(): string {
  const now = new Date()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  return `${now.getFullYear()}-${m}-${d}`
}

async function openQuickAdd(page: Page): Promise<void> {
  await page.goto("/transactions")
  await page.getByTestId("quick-add-button-desktop").click()
  await expect(page.getByTestId("transaction-form")).toBeVisible()
  await expect(page.getByTestId("account-select")).toHaveValue(/.+/)
}

function waitForCreate(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/transactions") &&
      response.request().method() === "POST" &&
      response.status() === 201,
  )
}

test.beforeEach(async () => {
  await resetSeedData()
})

// 뒤이어 실행되는 스펙(transactions.spec)도 시드 상태를 가정하므로 복원한다
test.afterAll(async () => {
  await resetSeedData()
})

test("(a) 이체 저장 시 출금·입금 계좌 잔액이 동시에 반영된다", async ({ page }) => {
  await login(page)
  await openQuickAdd(page)

  await page.getByRole("radio", { name: "이체" }).click()
  await page.getByTestId("amount-input").fill("30000")
  await page.getByTestId("to-account-select").selectOption({ label: "E2E적금" })

  await Promise.all([waitForCreate(page), page.getByTestId("save-transaction").click()])

  const balances = await readAccountBalances(page, ACCOUNTS)
  expect(balances["E2E은행"]).toContain("70,000")
  expect(balances["E2E적금"]).toContain("30,000")
})

test("(b) 저축 거래(지출+저축 카테고리+입금 계좌)는 두 계좌 잔액에 반영된다", async ({
  page,
}) => {
  await login(page)
  await openQuickAdd(page)

  await page.getByTestId("amount-input").fill("20000")
  await page.getByTestId("category-chip-저축").click()
  // 저축 카테고리 선택 시 같은 폼 안에서 입금 계좌가 확장된다 (PRD §5 규칙 1)
  await page.getByTestId("to-account-select").selectOption({ label: "E2E적금" })

  await Promise.all([waitForCreate(page), page.getByTestId("save-transaction").click()])

  const balances = await readAccountBalances(page, ACCOUNTS)
  expect(balances["E2E은행"]).toContain("80,000")
  expect(balances["E2E적금"]).toContain("20,000")
})

test("(c) 거래 금액 수정 시 잔액이 재계산된다", async ({ page }) => {
  await login(page)
  await openQuickAdd(page)

  await page.getByTestId("amount-input").fill("10000")
  await page.getByTestId("category-chip-식비").click()
  await Promise.all([waitForCreate(page), page.getByTestId("save-transaction").click()])

  let balances = await readAccountBalances(page, ["E2E은행"])
  expect(balances["E2E은행"]).toContain("90,000")

  // 수정: 10,000 → 25,000
  await page.goto("/transactions")
  const row = page.getByTestId("transaction-row").first()
  await expect(row).toBeEnabled()
  await row.click()
  await page.getByTestId("amount-input").fill("25000")
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/transactions/") &&
        response.request().method() === "PATCH" &&
        response.status() === 200,
    ),
    page.getByTestId("save-transaction").click(),
  ])

  await expect(page.getByTestId("month-expense-total")).toContainText("25,000원")
  balances = await readAccountBalances(page, ["E2E은행"])
  expect(balances["E2E은행"]).toContain("75,000")
})

test("(d) 금액 0은 에러 표시 + 저장 요청 미발생, 음수는 서버가 400으로 거절한다", async ({
  page,
}) => {
  await login(page)
  await openQuickAdd(page)

  const posts: string[] = []
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/v1/transactions"
    ) {
      posts.push(request.url())
    }
  })

  await page.getByTestId("amount-input").fill("0")
  await page.getByTestId("category-chip-식비").click()
  await page.getByTestId("save-transaction").click()

  await expect(page.getByRole("alert")).toContainText("금액은 0보다 커야 합니다")
  expect(posts).toHaveLength(0)

  // 클라이언트 입력기는 음수 기호를 걸러내므로, 음수는 API 경계에서 직접 검증한다
  const accountsResponse = await page.request.get("/api/v1/accounts")
  const accountsBody = (await accountsResponse.json()) as {
    data: Array<{ id: string; name: string }>
  }
  const bank = accountsBody.data.find((account) => account.name === "E2E은행")
  expect(bank).toBeDefined()

  const negativeResponse = await page.request.post("/api/v1/transactions", {
    data: {
      type: "expense",
      amount: -100,
      description: "음수 금액",
      categoryId: null,
      accountId: bank?.id,
      toAccountId: null,
      date: todayString(),
    },
  })
  expect(negativeResponse.status()).toBe(400)
  const negativeBody = await negativeResponse.json()
  expect(negativeBody.success).toBe(false)
  expect(negativeBody.error.code).toBe("VALIDATION_ERROR")
})

test("(f) 대분류 탭 → 소분류 칩 확장 → 소분류로 저장 → 목록에 소분류명 표시", async ({
  page,
}) => {
  // 시드에는 소분류가 없으므로 식비 아래 '외식'을 직접 삽입한다
  const sql = postgres(LOCAL_SUPABASE.databaseUrl, { prepare: false, max: 1 })
  try {
    await sql`
      INSERT INTO public.categories (name, type, expense_kind, parent_id, sort_order)
      SELECT '외식', 'expense', 'consumption', id, 0
      FROM public.categories WHERE name = '식비'
    `
  } finally {
    await sql.end()
  }

  await login(page)
  await openQuickAdd(page)

  // 1행에는 대분류만 — 소분류는 아직 보이지 않는다
  await expect(page.getByTestId("category-chip-식비")).toBeVisible()
  await expect(page.getByTestId("category-chip-외식")).toBeHidden()

  await page.getByTestId("amount-input").fill("7000")
  await page.getByTestId("category-chip-식비").click()

  // 대분류 선택 → 소분류 행 확장 → 소분류 선택
  await expect(page.getByTestId("category-child-row")).toBeVisible()
  await page.getByTestId("category-chip-외식").click()
  await expect(page.getByTestId("category-chip-외식")).toHaveAttribute(
    "aria-selected",
    "true",
  )

  await Promise.all([waitForCreate(page), page.getByTestId("save-transaction").click()])

  // 내용 미입력 → 선택한 소분류명이 내용으로 저장돼 목록에 표시된다
  await page.goto("/transactions")
  await expect(page.getByTestId("transaction-row").first()).toContainText("외식")
})

test.describe("(e) 모바일 뷰포트 375px", () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test("하단 탭으로 이동하고 ＋ 빠른 입력 시트로 거래를 기록한다", async ({ page }) => {
    await login(page)

    // 하단 탭 바 (모바일 전용) 노출 + 탭 내비게이션
    const tabBar = page.getByRole("navigation", { name: "주요 메뉴" })
    await expect(tabBar).toBeVisible()
    await tabBar.getByRole("link", { name: "거래" }).click()
    await page.waitForURL("**/transactions**")

    // 중앙 ＋ → 빠른 입력 시트
    await page.getByTestId("quick-add-button").click()
    await expect(page.getByTestId("transaction-form")).toBeVisible()
    await page.getByTestId("amount-input").fill("5000")
    await page.getByTestId("category-chip-식비").click()
    await expect(page.getByTestId("account-select")).toHaveValue(/.+/)

    await Promise.all([
      waitForCreate(page),
      page.getByTestId("save-transaction").click(),
    ])

    await expect(page.getByTestId("transaction-row").first()).toContainText("식비")
    await expect(page.getByTestId("month-expense-total")).toContainText("5,000원")

    const balances = await readAccountBalances(page, ["E2E은행"])
    expect(balances["E2E은행"]).toContain("95,000")
  })
})
