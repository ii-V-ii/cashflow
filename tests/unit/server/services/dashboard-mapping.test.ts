import { describe, expect, test } from "vitest"

import {
  mapDashboard,
  type RawDashboard,
} from "@/server/services/dashboard-mapping"
import type { TransactionDto } from "@/types/api"

/** get_dashboard RPC(DB.md §3.9) 원형 → API.md §8.1 DTO 매핑 */

const TX_STUB = { id: "tx-1" } as TransactionDto

const RAW: RawDashboard = {
  total_balance: 430_000,
  account_count: 2,
  net_worth: 430_000,
  month_income: 500_000,
  month_expense: 170_000,
  investment: null,
  budget_usage: null,
  calendar: [{ date: "2026-07-10", income: 500_000, expense: 170_000 }],
  recent_transactions: [TX_STUB],
}

describe("mapDashboard", () => {
  test("snake_case RPC 결과를 API DTO(camelCase)로 매핑한다", () => {
    const dto = mapDashboard(RAW)

    expect(dto).toEqual({
      netWorth: 430_000,
      totalBalance: 430_000,
      accountCount: 2,
      monthlyIncome: 500_000,
      monthlyExpense: 170_000,
      investment: null,
      budget: null,
      dailyTotals: [{ date: "2026-07-10", income: 500_000, expense: 170_000 }],
      recentTransactions: [TX_STUB],
    })
  })

  test("예산·투자 placeholder는 null로 유지된다 (Phase 2 통합에서 확장)", () => {
    const dto = mapDashboard(RAW)
    expect(dto.investment).toBeNull()
    expect(dto.budget).toBeNull()
  })

  test("빈 상태 — null 배열·null 합계를 0/빈 배열로 정규화한다", () => {
    const dto = mapDashboard({
      total_balance: null,
      account_count: 0,
      net_worth: null,
      month_income: null,
      month_expense: null,
      investment: null,
      budget_usage: null,
      calendar: null,
      recent_transactions: null,
    })

    expect(dto.totalBalance).toBe(0)
    expect(dto.netWorth).toBe(0)
    expect(dto.monthlyIncome).toBe(0)
    expect(dto.monthlyExpense).toBe(0)
    expect(dto.dailyTotals).toEqual([])
    expect(dto.recentTransactions).toEqual([])
  })
})
