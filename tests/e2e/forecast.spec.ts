import { expect, test } from "@playwright/test"

import { login, resetSeedData } from "./helpers"

/**
 * Phase 2E E2E:
 * (a) 시나리오 생성 → 실행 → 차트 데이터 렌더링 + 목표 도달 배지
 * (b) CSV 내보내기 — BOM·헤더·필터 반영 (세션 쿠키 공유 page.request)
 */

test.beforeEach(async () => {
  await resetSeedData()
})

test.afterAll(async () => {
  await resetSeedData()
})

test("(a) 시나리오 생성 → 실행 → 예측 차트가 렌더링된다", async ({ page }) => {
  await login(page)
  await page.goto("/forecast")

  // 빈 상태 CTA → 생성 시트
  await page.getByTestId("add-scenario-cta").click()
  await page.getByTestId("scenario-name-input").fill("E2E 기본 시나리오")
  await page.getByTestId("scenario-income-rate-input").fill("3")

  const createResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/forecast/scenarios") &&
      response.request().method() === "POST" &&
      response.status() === 201,
  )
  await page.getByTestId("save-scenario").click()
  await createResponse

  // 카드 등장 + 기본 선택
  const card = page.getByTestId("scenario-card")
  await expect(card).toHaveCount(1)
  await expect(card).toContainText("E2E 기본 시나리오")

  // 실행 → 결과 저장 → 차트 렌더링
  const runResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/forecast/run") && response.status() === 200,
  )
  await page.getByTestId("run-forecast").click()
  await runResponse

  await expect(page.getByTestId("forecast-charts")).toBeVisible()
  await expect(page.getByRole("region", { name: "현금흐름 예측" })).toBeVisible()
  await expect(page.getByRole("region", { name: "자산 성장 예측" })).toBeVisible()

  // 목표 금액 입력 → 도달 배지 (시드 잔액 100,000 ≥ 목표 1원 → 첫 달 도달)
  await page.getByTestId("goal-input").fill("1")
  await expect(page.getByTestId("goal-reach-badge")).toBeVisible()

  // 재방문 시 저장된 결과 복원 (API.md §13.7)
  await page.reload()
  await expect(page.getByTestId("forecast-charts")).toBeVisible()
})

test("(b) CSV 내보내기 — BOM·헤더·필터 반영", async ({ page }) => {
  await login(page)

  const response = await page.request.get("/api/v1/export/transactions")
  expect(response.status()).toBe(200)
  expect(response.headers()["content-type"]).toBe("text/csv; charset=utf-8")
  expect(response.headers()["content-disposition"]).toBe(
    'attachment; filename="transactions_all.csv"',
  )

  const body = await response.body()
  // UTF-8 BOM (Excel 호환)
  expect([...body.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
  expect(body.toString("utf-8")).toContain(
    "날짜,유형,카테고리,계좌,도착계좌,금액,내용,메모,태그,할부",
  )

  const filtered = await page.request.get(
    "/api/v1/export/transactions?from=2026-01-01&to=2026-01-31",
  )
  expect(filtered.headers()["content-disposition"]).toBe(
    'attachment; filename="transactions_2026-01-01_2026-01-31.csv"',
  )
})
