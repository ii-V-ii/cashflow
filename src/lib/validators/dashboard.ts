import { z } from "zod"

import { monthQuery, yearQuery } from "./common"

/** GET /dashboard 쿼리 — 미지정 시 현재 연·월 (API.md §8.1) */
export const dashboardQuerySchema = z.object({
  year: yearQuery.default(() => new Date().getFullYear()),
  month: monthQuery.default(() => new Date().getMonth() + 1),
})

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>
