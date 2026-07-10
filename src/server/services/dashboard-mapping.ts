import type { DailyTotalDto, DashboardDto, TransactionDto } from "@/types/api"

/**
 * get_dashboard RPC(DB.md §3.9) 원형 → API.md §8.1 DTO 매핑.
 * 순수 함수 — DB 접근 없음 (단위 테스트 대상).
 *
 * investment/budget_usage는 예산·투자 트랙의 뷰(budget_totals_v,
 * monthly_investment_summary_v)가 랜딩되기 전까지 RPC가 null placeholder를
 * 반환한다 — Phase 2 통합에서 RPC를 CREATE OR REPLACE로 확장하면
 * 이 매핑은 그대로 실값을 통과시킨다.
 */

export interface RawDashboard {
  total_balance: number | null
  account_count: number
  net_worth: number | null
  month_income: number | null
  month_expense: number | null
  investment: { totalValue: number; totalGain: number; gainRate: number } | null
  budget_usage: { plannedTotal: number; actualTotal: number; ratio: number } | null
  calendar: DailyTotalDto[] | null
  recent_transactions: TransactionDto[] | null
}

export function mapDashboard(raw: RawDashboard): DashboardDto {
  return {
    netWorth: raw.net_worth ?? 0,
    totalBalance: raw.total_balance ?? 0,
    accountCount: raw.account_count,
    investment: raw.investment,
    monthlyIncome: raw.month_income ?? 0,
    monthlyExpense: raw.month_expense ?? 0,
    dailyTotals: raw.calendar ?? [],
    budget: raw.budget_usage,
    recentTransactions: raw.recent_transactions ?? [],
  }
}
