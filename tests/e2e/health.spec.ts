import { expect, test } from "@playwright/test"

test("GET /api/v1/health returns success envelope (인증 예외 경로)", async ({
  request,
}) => {
  const response = await request.get("/api/v1/health")

  expect(response.status()).toBe(200)
  expect(await response.json()).toEqual({
    success: true,
    data: { status: "ok" },
  })
})

test("모든 응답에 보안 헤더가 적용된다 (SEC-H2)", async ({ request }) => {
  const response = await request.get("/api/v1/health")
  const headers = response.headers()

  expect(headers["strict-transport-security"]).toBe(
    "max-age=31536000; includeSubDomains",
  )
  expect(headers["x-content-type-options"]).toBe("nosniff")
  expect(headers["x-frame-options"]).toBe("DENY")
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin")
  expect(headers["permissions-policy"]).toBe(
    "camera=(), microphone=(), geolocation=()",
  )
})

test("미인증 홈 접근은 로그인 페이지로 이동한다", async ({ page }) => {
  await page.goto("/")

  await page.waitForURL("**/login")
  await expect(page.locator("h1")).toHaveText("금전출납부")
})
