import { describe, expect, test } from "vitest"

import nextConfig from "../../../next.config"

/**
 * SEC-H2: 전 라우트 보안 헤더 — next.config.ts headers() 검증.
 * (CSP는 Next.js nonce 구성 후속 이슈 — docs/ARCHITECTURE.md §8 기록 참조)
 */
describe("next.config headers() (SEC-H2 보안 헤더)", () => {
  test("applies required security headers to all routes", async () => {
    const rules = await nextConfig.headers?.()
    expect(rules).toBeDefined()

    const allRoutes = rules?.find((rule) => rule.source === "/(.*)")
    expect(allRoutes).toBeDefined()

    const headerMap = Object.fromEntries(
      (allRoutes?.headers ?? []).map((header) => [header.key, header.value]),
    )

    expect(headerMap["Strict-Transport-Security"]).toBe(
      "max-age=31536000; includeSubDomains",
    )
    expect(headerMap["X-Content-Type-Options"]).toBe("nosniff")
    expect(headerMap["X-Frame-Options"]).toBe("DENY")
    expect(headerMap["Referrer-Policy"]).toBe("strict-origin-when-cross-origin")
    expect(headerMap["Permissions-Policy"]).toBe(
      "camera=(), microphone=(), geolocation=()",
    )
  })
})
