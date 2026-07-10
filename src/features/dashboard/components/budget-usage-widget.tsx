import Link from "next/link"

import { formatKrw } from "@/lib/format"
import type { DashboardBudgetUsageDto } from "@/types/api"

const BAR_CAP_PERCENT = 100

interface BudgetUsageWidgetProps {
  /** 해당 월 예산이 없으면 null (get_dashboard.budget_usage) */
  budget: DashboardBudgetUsageDto | null
}

/** 예산 소진율 위젯 — 지출 계획 대비 실지출 프로그레스 (API.md §8.1) */
export function BudgetUsageWidget({ budget }: BudgetUsageWidgetProps) {
  if (budget === null) {
    return (
      <div className="flex flex-col gap-1 rounded-xl bg-surface-raised p-4 ring-1 ring-hairline">
        <p className="text-xs font-medium text-ink-muted">예산 소진율</p>
        <p className="text-sm text-ink-muted">이번 달 예산이 없습니다</p>
        <Link
          href="/budgets"
          className="flex min-h-11 items-center text-xs font-medium text-ink underline underline-offset-2"
        >
          예산 만들기
        </Link>
      </div>
    )
  }

  // ratio null = 지출 계획 0 (get_budget_actuals 규약) — 실지출이 있으면 초과 상태로 표시
  const ratio = budget.ratio === null ? null : Math.round(budget.ratio)
  const isOverBudget =
    ratio === null ? budget.actualTotal > 0 : ratio > BAR_CAP_PERCENT
  const barPercent =
    ratio === null
      ? isOverBudget
        ? BAR_CAP_PERCENT
        : 0
      : Math.min(ratio, BAR_CAP_PERCENT)

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-surface-raised p-4 ring-1 ring-hairline">
      <p className="text-xs font-medium text-ink-muted">예산 소진율</p>
      <p
        className={`amount text-[length:var(--text-amount-md)] font-semibold ${
          isOverBudget ? "text-expense-fg" : "text-ink"
        }`}
      >
        {ratio === null ? "—" : `${ratio}%`}
      </p>
      <div
        role="progressbar"
        aria-label="예산 소진율"
        aria-valuenow={barPercent}
        aria-valuemin={0}
        aria-valuemax={BAR_CAP_PERCENT}
        className="h-1.5 overflow-hidden rounded-full bg-surface-sunken"
      >
        <div
          data-testid="budget-usage-bar"
          className={`h-full rounded-full ${
            isOverBudget ? "bg-expense-fg" : "bg-ink"
          }`}
          style={{ width: `${barPercent}%` }}
        />
      </div>
      <p className="amount text-xs text-ink-muted">
        {formatKrw(budget.actualTotal)} / {formatKrw(budget.plannedTotal)}
      </p>
    </div>
  )
}
