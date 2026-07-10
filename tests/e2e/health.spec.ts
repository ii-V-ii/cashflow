import { expect, test } from "@playwright/test"

test("GET /api/v1/health returns success envelope", async ({ request }) => {
  const response = await request.get("/api/v1/health")

  expect(response.status()).toBe(200)
  expect(await response.json()).toEqual({
    success: true,
    data: { status: "ok" },
  })
})

test("dashboard placeholder page loads", async ({ page }) => {
  await page.goto("/")

  await expect(page.locator("h1")).toBeVisible()
  await expect(page.locator("h1")).toHaveText("금전출납부")
})
