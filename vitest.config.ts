import path from "node:path"

import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

const alias = {
  "server-only": path.resolve(__dirname, "./tests/mocks/server-only.ts"),
  "@": path.resolve(__dirname, "./src"),
}

export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    globals: true,
    passWithNoTests: true, // integration/cross 프로젝트가 비어 있는 Phase 0 허용
    coverage: {
      provider: "v8",
      include: ["src/server/**/*.ts", "src/lib/**/*.ts"],
      exclude: [
        "src/server/db/client.ts", // 실 DB 커넥션 — integration에서 검증
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.{ts,tsx}"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "cross",
          environment: "node",
          include: ["tests/cross/**/*.test.ts"],
        },
      },
    ],
  },
})
