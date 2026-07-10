import { expect, test, type Page } from "@playwright/test"

import { login, readAccountBalances, resetSeedData } from "./helpers"

/**
 * Phase 1b 핵심 플로우 (수용 기준):
 * 로그인 → 거래 저장 → 목록 반영 + 잔액 갱신, 저장 API 왕복 1회(네트워크 어설션),
 * 삭제 시 잔액 복원. 시드: E2E은행 100,000원 (helpers.resetSeedData).
 */

const EXPENSE_AMOUNT = "12000"

async function bankBalanceText(page: Page): Promise<string> {
  const balances = await readAccountBalances(page, ["E2E은행"])
  return balances["E2E은행"]
}

// 앞선 스펙 파일이 남긴 데이터와 무관하게 시드 상태에서 시작한다
test.beforeAll(async () => {
  await resetSeedData()
})

test.describe.serial("거래 코어 E2E", () => {
  test("미인증 접근은 /login으로, API는 401 envelope", async ({ page, request }) => {
    await page.goto("/transactions")
    await page.waitForURL("**/login")

    const response = await request.get("/api/v1/transactions")
    expect(response.status()).toBe(401)
    const body = await response.json()
    expect(body.error.code).toBe("UNAUTHORIZED")
  })

  test("로그인 → 거래 저장(왕복 1회) → 목록·잔액 반영 → 삭제 시 잔액 복원", async ({
    page,
  }) => {
    await login(page)

    // 시드 잔액 확인
    expect(await bankBalanceText(page)).toContain("100,000")

    await page.goto("/transactions")
    await expect(page.getByTestId("current-month")).toBeVisible()

    // 빠른 거래 입력: ＋ → 금액 → 카테고리 칩 → 저장 (2~3탭 흐름)
    await page.getByTestId("quick-add-button-desktop").click()
    await page.getByTestId("amount-input").fill(EXPENSE_AMOUNT)
    await page.getByTestId("category-chip-식비").click()
    await expect(page.getByTestId("account-select")).toHaveValue(/.+/)

    // ── 네트워크 계측: 저장 클릭 ~ 무효화 리페치 완료 구간 ──
    const apiCalls: string[] = []
    const onRequest = (request: import("@playwright/test").Request) => {
      const url = new URL(request.url())
      if (url.pathname.startsWith("/api/v1")) {
        apiCalls.push(`${request.method()} ${url.pathname}`)
      }
    }
    page.on("request", onRequest)

    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes("/api/v1/transactions") &&
          response.request().method() === "POST" &&
          response.status() === 201,
      ),
      page.getByTestId("save-transaction").click(),
    ])

    // 낙관적 반영: 응답 처리와 무관하게 행이 즉시 보인다
    await expect(page.getByTestId("transaction-row").first()).toContainText("식비")
    await expect(page.getByTestId("month-expense-total")).toContainText("12,000원")

    // 무효화 리페치가 정착할 시간
    await page.waitForLoadState("networkidle")
    page.off("request", onRequest)

    // 저장 네트워크: POST 1회 + 해당 월 무효화 리페치만 (광역 리페치 금지)
    const posts = apiCalls.filter((call) => call.startsWith("POST"))
    expect(posts).toEqual(["POST /api/v1/transactions"])
    const gets = apiCalls.filter((call) => call.startsWith("GET"))
    const transactionGets = gets.filter((call) =>
      call.startsWith("GET /api/v1/transactions"),
    )
    expect(transactionGets.length).toBeLessThanOrEqual(1)
    // 허용 리페치: 거래 월 목록·계좌 잔액 외 어떤 자원도 다시 불리지 않는다
    for (const call of gets) {
      expect(call).toMatch(/^GET \/api\/v1\/(transactions|accounts)$/)
    }
    expect(apiCalls.length).toBeLessThanOrEqual(4)

    // 잔액 갱신: 100,000 − 12,000 = 88,000
    expect(await bankBalanceText(page)).toContain("88,000")

    // ── 삭제 → 잔액 복원 ──
    await page.goto("/transactions")
    await page.getByTestId("transaction-row").first().click()
    await page.getByTestId("delete-transaction").click()
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes("/api/v1/transactions/") &&
          response.request().method() === "DELETE" &&
          response.status() === 200,
      ),
      page.getByTestId("confirm-action").click(),
    ])

    await expect(page.getByTestId("transaction-row")).toHaveCount(0)
    expect(await bankBalanceText(page)).toContain("100,000")
  })
})
