import { expect, test, type Page } from "@playwright/test"

import { login, resetSeedData } from "./helpers"

/**
 * Phase 2A 예산 E2E:
 * (a) 예산 생성(인라인 입력 → 저장) → 거래 입력 → 실적 반영
 * (b) 전월 예산 복사 CTA
 * (c) 연간 그리드 셀 upsert
 * 시드: 카테고리 식비·저축(saving)·급여, 계좌 E2E은행/E2E적금 (helpers.resetSeedData)
 */

function currentYearMonth(): { year: number; month: number } {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

async function gotoBudgets(page: Page): Promise<void> {
  await page.goto("/budgets")
  await expect(page.getByRole("heading", { name: "예산" })).toBeVisible()
}

function waitForBudgetWrite(page: Page, method: "POST" | "PATCH" | "PUT") {
  return page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/budgets") &&
      response.request().method() === method &&
      response.status() < 300,
  )
}

test.beforeEach(async () => {
  await resetSeedData()
})

test.afterAll(async () => {
  await resetSeedData()
})

test("(a) 예산 생성 → 거래 입력 → 실적·진행 바 반영", async ({ page }) => {
  await login(page)
  await gotoBudgets(page)

  // 예산 없음 → 전월 복사 CTA + 0원 초기화 그리드
  await expect(page.getByTestId("copy-previous-month")).toBeVisible()

  // 인라인 입력으로 예산 편성
  await page.getByTestId("budget-input-식비").fill("300000")
  await page.getByTestId("budget-input-저축").fill("500000")
  await page.getByTestId("budget-input-급여").fill("4000000")

  await Promise.all([
    waitForBudgetWrite(page, "POST"),
    page.getByTestId("save-budget").click(),
  ])

  // 그룹 합계 반영 (수입/소비/저축 구분)
  await expect(page.getByTestId("budget-total-consumption")).toHaveText("300,000원")
  await expect(page.getByTestId("budget-total-saving")).toHaveText("500,000원")
  await expect(page.getByTestId("budget-total-income")).toHaveText("4,000,000원")
  // 저장 후 CTA·저장 바 사라짐
  await expect(page.getByTestId("copy-previous-month")).toBeHidden()
  await expect(page.getByTestId("save-budget")).toBeHidden()

  // 거래 입력(지출 30,000 식비) → 예산 실적 반영
  await page.goto("/transactions")
  await page.getByTestId("quick-add-button-desktop").click()
  await expect(page.getByTestId("transaction-form")).toBeVisible()
  await page.getByTestId("amount-input").fill("30000")
  await page.getByTestId("category-chip-식비").click()
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/transactions") &&
        response.request().method() === "POST" &&
        response.status() === 201,
    ),
    page.getByTestId("save-transaction").click(),
  ])

  await gotoBudgets(page)
  await expect(
    page.locator("li").filter({ hasText: "식비" }).getByText("실적 30,000원"),
  ).toBeVisible()
})

test("(b) 전월 예산 복사 CTA", async ({ page }) => {
  await login(page)
  await gotoBudgets(page)

  // 이번 달 예산 생성
  await page.getByTestId("budget-input-식비").fill("250000")
  await Promise.all([
    waitForBudgetWrite(page, "POST"),
    page.getByTestId("save-budget").click(),
  ])

  // 다음 달로 이동 → 예산 없음 → 전월 복사
  await page.getByRole("button", { name: "다음 달" }).click()
  await expect(page.getByTestId("copy-previous-month")).toBeVisible()
  await Promise.all([
    waitForBudgetWrite(page, "POST"),
    page.getByTestId("copy-previous-month").click(),
  ])

  await expect(page.getByTestId("budget-input-식비")).toHaveValue("250,000")
  await expect(page.getByTestId("budget-total-consumption")).toHaveText("250,000원")
})

test("(c) 연간 그리드 셀 편집 → 월별 예산에 반영", async ({ page }) => {
  const { year, month } = currentYearMonth()
  await login(page)
  await gotoBudgets(page)

  await page.getByTestId("budget-tab-grid").click()
  await expect(page.getByTestId("annual-grid")).toBeVisible()

  await page.getByTestId(`grid-cell-식비-${month}`).click()
  await page.getByLabel(`식비 ${month}월 계획`).fill("180000")
  await Promise.all([
    waitForBudgetWrite(page, "PUT"),
    page.getByLabel(`식비 ${month}월 계획`).press("Enter"),
  ])

  await expect(page.getByTestId(`grid-cell-식비-${month}`)).toHaveText("180,000")
  await expect(page.getByTestId("grid-grand-total")).toHaveText("180,000")
  expect(year).toBeGreaterThan(2000)

  // 월별 탭에서도 같은 값
  await page.getByTestId("budget-tab-monthly").click()
  await expect(page.getByTestId("budget-input-식비")).toHaveValue("180,000")
})
