import { expect, test, type Page } from "@playwright/test"

import { login, resetSeedData } from "./helpers"

/**
 * 전 메뉴 첫 진입 SSR 프리페치 (Task #12):
 * RSC가 서비스 직접 호출로 데이터를 dehydrate하므로, 첫 진입 시
 * 클라이언트에서 해당 GET API 왕복 없이 즉시 데이터가 렌더되어야 한다.
 */

/** 문서 로드 동안 발생한 /api/v1 GET 요청 URL 수집기 */
function collectApiGets(page: Page): string[] {
  const urls: string[] = []
  page.on("request", (request) => {
    if (request.method() === "GET" && request.url().includes("/api/v1/")) {
      urls.push(request.url())
    }
  })
  return urls
}

test.beforeAll(async () => {
  await resetSeedData()
})

test.describe.serial("SSR 프리페치 첫 진입", () => {
  test("거래: 첫 진입 시 GET API 왕복 없이 거래·요약이 즉시 렌더된다", async ({
    page,
  }) => {
    await login(page)

    // 시드: 현재 월 거래 1건 생성 (로그인 쿠키 공유 request로 REST 직접 호출)
    const accounts = await (await page.request.get("/api/v1/accounts")).json()
    const categories = await (
      await page.request.get("/api/v1/categories?type=expense")
    ).json()
    const now = new Date()
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-05`
    const created = await page.request.post("/api/v1/transactions", {
      data: {
        type: "expense",
        amount: 8800,
        description: "SSR점심",
        categoryId: categories.data[0].id,
        accountId: accounts.data[0].id,
        date,
      },
    })
    expect(created.status()).toBe(201)

    // 첫 진입 (전체 문서 로드 — 클라이언트 캐시 없음)
    const apiGets = collectApiGets(page)
    await page.goto("/transactions")
    await expect(page.getByText("SSR점심")).toBeVisible()

    // 하이드레이션 미스 0: 거래/계좌/카테고리 GET이 전혀 발생하지 않아야 한다
    expect(
      apiGets.filter((url) => url.includes("/api/v1/transactions")),
    ).toHaveLength(0)
    expect(apiGets.filter((url) => url.includes("/api/v1/accounts"))).toHaveLength(0)
    expect(
      apiGets.filter((url) => url.includes("/api/v1/categories")),
    ).toHaveLength(0)
  })

  test("예산: 첫 진입 시 예산 GET API 왕복 없이 화면이 렌더된다", async ({
    page,
  }) => {
    await login(page)

    const apiGets = collectApiGets(page)
    await page.goto("/budgets")
    await expect(
      page.getByRole("heading", { name: "예산", exact: true }),
    ).toBeVisible()
    // 월별 탭 콘텐츠가 렌더될 때까지 대기 (프리페치 데이터 기반)
    await expect(page.getByTestId("budget-tab-monthly")).toBeVisible()

    expect(apiGets.filter((url) => url.includes("/api/v1/budgets"))).toHaveLength(0)
  })

  test("홈: 첫 진입 시 대시보드 GET 없이 렌더되고 스켈레톤을 거치지 않는다", async ({
    page,
  }) => {
    await login(page)

    const apiGets = collectApiGets(page)
    await page.goto("/")
    // aria-busy 스켈레톤이 아닌 실제 콘텐츠(월 내비게이터 영역) 확인
    await expect(page.locator("main[aria-busy]")).toHaveCount(0)

    expect(apiGets.filter((url) => url.includes("/api/v1/dashboard"))).toHaveLength(0)
  })
})
