import { expect, test, type Page } from "@playwright/test"

import { login, readAccountBalances, resetSeedData, seedTransactions } from "./helpers"

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
    // 허용 리페치: 거래 월 목록·계좌 잔액·월 결산(상단 요약) 외 어떤 자원도 다시 불리지 않는다.
    // (설계 변경: 상단 요약이 월 원장 items 클라이언트 합산 대신 결산 RPC를 쓰게 되며
    //  저장 시 settlements/monthly 무효화 리페치가 새로 추가됨 — 기존 허용 목록 확장)
    for (const call of gets) {
      expect(call).toMatch(
        /^GET \/api\/v1\/(transactions|accounts|settlements\/monthly)$/,
      )
    }
    expect(apiCalls.length).toBeLessThanOrEqual(5)

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

/**
 * 월 원장 100건 초과 회귀 (버그: 월초 거래 소실 + 상단 지출 합계 과소 표시).
 * 원인: 월 원장 조회 page=1,limit=100 고정 + 서버 ORDER BY date DESC LIMIT 100 절단,
 * 상단 합계를 절단된 items로 클라이언트 합산, 기본 뷰에 페이지네이션 UI 부재.
 */
test.describe.serial("월 원장 100건 초과 회귀", () => {
  test.beforeEach(async () => {
    await resetSeedData()
  })

  // 뒤이어 실행되는 다른 스펙도 시드 상태를 가정하므로 복원한다
  test.afterAll(async () => {
    await resetSeedData()
  })

  test("101건 시드 시 월초 거래가 페이지 이동으로 노출되고 상단 지출 합계가 실제 총합과 일치한다", async ({
    page,
  }) => {
    const now = new Date()
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
    const SEED_COUNT = 101
    const PAGE_SIZE = 20
    const totalPages = Math.ceil(SEED_COUNT / PAGE_SIZE)
    const { total, earliestDescription } = await seedTransactions(SEED_COUNT, ym)

    await login(page)
    await page.goto("/transactions")
    await expect(page.getByTestId("current-month")).toBeVisible()

    // 상단 지출 합계 = 실제 총합(101건) — 이전엔 100건 절단분(100,000원)만 반영해 과소 표시됐다
    await expect(page.getByTestId("month-expense-total")).toContainText(
      `${total.toLocaleString("ko-KR")}원`,
    )

    // 기본(비필터) 뷰에도 페이지네이션 nav가 노출된다 (이전엔 필터 모드에서만 노출)
    const nav = page.getByRole("navigation", { name: "페이지" })
    await expect(nav).toBeVisible()

    // 마지막 페이지까지 이동해 절단되었던 월초 거래를 확인한다. networkidle 같은 비결정적
    // 대기 대신, 매 클릭 후 nav의 "n / total" 표시가 실제로 갱신됐는지 로케이터로 확인한다.
    const nextButton = page.getByRole("button", { name: "다음" })
    for (let currentPage = 1; currentPage < totalPages; currentPage++) {
      await expect(nav).toContainText(`${currentPage} / ${totalPages}`)
      await nextButton.click()
    }
    await expect(nav).toContainText(`${totalPages} / ${totalPages}`)
    await expect(nextButton).toBeDisabled()
    await expect(page.getByText(earliestDescription)).toBeVisible()
  })
})
