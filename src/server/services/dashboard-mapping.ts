import type {
  DailyTotalDto,
  DashboardBudgetUsageDto,
  DashboardDto,
  DashboardInvestmentDto,
  TransactionDto,
} from "@/types/api"

/**
 * get_dashboard RPC(DB.md §3.9) 원형 → API.md §8.1 DTO 매핑.
 * 순수 함수 — DB 접근 없음 (단위 테스트 대상).
 *
 * investment/budget_usage 는 RPC 가 camelCase jsonb 로 조립해 돌려주며
 * 빈 상태(자산 없음·해당 월 예산 없음)면 null — 매핑은 그대로 통과시킨다.
 */

export interface RawDashboard {
  total_balance: number | null
  account_count: number
  net_worth: number | null
  month_income: number | null
  month_expense: number | null
  investment: DashboardInvestmentDto | null
  budget_usage: DashboardBudgetUsageDto | null
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
