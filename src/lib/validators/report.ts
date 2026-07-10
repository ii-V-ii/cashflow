import { z } from "zod"

import { monthQuery, yearMonthString, yearQuery } from "./common"

/** GET /reports/trend 쿼리 — from/to 'YYYY-MM' 선택, 기본 최근 12개월 (API.md §14.1) */
export const reportTrendQuerySchema = z
  .object({
    from: yearMonthString.optional(),
    to: yearMonthString.optional(),
  })
  .refine(
    (query) =>
      query.from === undefined || query.to === undefined || query.from <= query.to,
    { message: "from은 to보다 늦을 수 없습니다", path: ["from"] },
  )

export type ReportTrendQuery = z.infer<typeof reportTrendQuerySchema>

/** GET /reports/categories 쿼리 — year·month 필수 (API.md §14.2) */
export const reportCategoriesQuerySchema = z.object({
  year: yearQuery,
  month: monthQuery,
})

export type ReportCategoriesQuery = z.infer<typeof reportCategoriesQuerySchema>

/** 순자산 추이 조회 상한 — 60개월(5년) */
export const MAX_NET_WORTH_MONTHS = 60

/** GET /reports/net-worth 쿼리 — months 기본 12 (API.md §14.3) */
export const reportNetWorthQuerySchema = z.object({
  months: z.coerce
    .number()
    .int("months는 정수여야 합니다")
    .min(1, "months는 1 이상이어야 합니다")
    .max(MAX_NET_WORTH_MONTHS, `months는 ${MAX_NET_WORTH_MONTHS} 이하여야 합니다`)
    .default(12),
})

export type ReportNetWorthQuery = z.infer<typeof reportNetWorthQuerySchema>
