import { expect, test } from "@playwright/test"

import { login, readAccountBalances, resetSeedData } from "./helpers"

/**
 * Phase 2D 정기거래 E2E (수용 기준):
 * 정기 거래 탭에서 규칙 생성 → pending 12건('예정') 확인 → process(온디맨드 보정)
 * → 도래분 applied 전환·잔액 반영 → 일시정지 → 미래 pending 정리.
 * 시드: E2E은행 100,000원 (helpers.resetSeedData).
 */

const MONTHLY_AMOUNT = "10000"

function todayYmd(): string {
  // 앱과 동일하게 로컬(KST) 기준 오늘
  const date = new Date()
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

test.beforeAll(async () => {
  await resetSeedData()
})

test.describe.serial("정기거래 E2E", () => {
  test("규칙 생성 → 예정 12건 → process → applied·잔액 반영 → 일시정지 정리", async ({
    page,
  }) => {
    test.slow() // 생성→process→토글까지 단계가 많아 기본 60초로는 빠듯하다
    await login(page)

    // ── 1. 정기 거래 탭에서 오늘 시작 월간 지출 규칙 생성 ──
    await page.goto("/transactions?tab=recurring")
    await expect(page.getByTestId("recurring-tab")).toBeVisible()

    await page.getByTestId("recurring-add-button").click()
    await page.getByTestId("recurring-amount-input").fill(MONTHLY_AMOUNT)
    await page.getByTestId("recurring-description-input").fill("E2E월세")
    await page.getByTestId("recurring-category-chip-식비").click()
    await expect(page.getByTestId("recurring-account-select")).toHaveValue(/.+/)
    await page.getByTestId("recurring-start-date").fill(todayYmd())
    await page.getByTestId("recurring-submit").click()

    // 목록에 규칙 표시
    const row = page
      .getByTestId("recurring-tab")
      .locator("li", { hasText: "E2E월세" })
    await expect(row).toBeVisible()
    await expect(row).toContainText("매월")

    // ── 2. pending 12건 이상 생성 확인 (오늘 시작 → 오늘 포함 13건) ──
    const pendingResponse = await page.request.get(
      "/api/v1/transactions?page=1&limit=100",
    )
    expect(pendingResponse.ok()).toBeTruthy()
    const pendingBody = await pendingResponse.json()
    const pendingItems = pendingBody.data.items.filter(
      (item: { status: string; description: string }) =>
        item.status === "pending" && item.description === "E2E월세",
    )
    expect(pendingItems.length).toBeGreaterThanOrEqual(12)

    // 전체 탭 목록에 '예정' 배지 노출 (이번 달 원장에 오늘자 pending 존재)
    await page.getByTestId("transactions-tab-all").click()
    await expect(page.getByText("예정").first()).toBeVisible()

    // 잔액은 아직 그대로 (pending은 잔액 미반영)
    expect((await readAccountBalances(page, ["E2E은행"]))["E2E은행"]).toContain(
      "100,000",
    )

    // ── 3. 온디맨드 process → 도래분 applied 전환 ──
    const processResponse = await page.request.post("/api/v1/recurring/process")
    expect(processResponse.ok()).toBeTruthy()
    const processBody = await processResponse.json()
    expect(processBody.success).toBe(true)
    expect(processBody.data.processed).toBe(1)

    // 잔액 반영: 100,000 − 10,000 = 90,000
    expect((await readAccountBalances(page, ["E2E은행"]))["E2E은행"]).toContain(
      "90,000",
    )

    // 멱등: 재실행 시 processed 0
    const secondProcess = await page.request.post("/api/v1/recurring/process")
    expect((await secondProcess.json()).data.processed).toBe(0)

    // ── 4. 일시정지 → 미래 pending 정리, applied 이력 보존 ──
    await page.goto("/transactions?tab=recurring")
    const toggle = page.getByRole("switch", { name: "E2E월세 활성" })
    await expect(toggle).toBeVisible()
    await toggle.click()
    // 토글 → PATCH → recurring 목록 무효화·리페치 후에 배지가 나타난다
    await expect(page.getByText("일시정지", { exact: true })).toBeVisible({
      timeout: 15_000,
    })

    const afterPause = await page.request.get(
      "/api/v1/transactions?page=1&limit=100",
    )
    const afterPauseItems = (await afterPause.json()).data.items as Array<{
      status: string
      description: string
    }>
    expect(
      afterPauseItems.filter(
        (item) => item.description === "E2E월세" && item.status === "pending",
      ),
    ).toHaveLength(0)
    expect(
      afterPauseItems.filter(
        (item) => item.description === "E2E월세" && item.status === "applied",
      ),
    ).toHaveLength(1)

    // 잔액 유지 (applied 이력 보존)
    expect((await readAccountBalances(page, ["E2E은행"]))["E2E은행"]).toContain(
      "90,000",
    )
  })

  test("검증 실패(이체 규칙 입금 계좌 누락)는 400 VALIDATION_ERROR envelope", async ({
    page,
  }) => {
    await login(page)
    const response = await page.request.post("/api/v1/recurring", {
      data: {
        type: "transfer",
        amount: 10000,
        description: "잘못된 이체",
        accountId: "00000000-0000-4000-8000-000000000000",
        frequency: "monthly",
        startDate: todayYmd(),
      },
    })
    expect(response.status()).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe("VALIDATION_ERROR")
  })
})
