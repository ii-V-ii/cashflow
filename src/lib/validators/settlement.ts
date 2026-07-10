import { z } from "zod"

import { monthQuery, yearQuery } from "./common"

/** GET /settlements/monthly 쿼리 — year·month 필수 (API.md §7.1) */
export const settlementMonthlyQuerySchema = z.object({
  year: yearQuery,
  month: monthQuery,
})

export type SettlementMonthlyQuery = z.infer<typeof settlementMonthlyQuerySchema>

/** GET /settlements/annual 쿼리 — year 필수 (API.md §7.2) */
export const settlementAnnualQuerySchema = z.object({
  year: yearQuery,
})

export type SettlementAnnualQuery = z.infer<typeof settlementAnnualQuerySchema>
