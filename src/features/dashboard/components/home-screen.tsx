"use client"

import Link from "next/link"
import { useState } from "react"

import { BudgetUsageWidget } from "@/features/dashboard/components/budget-usage-widget"
import { CalendarWidget } from "@/features/dashboard/components/calendar-widget"
import { InvestmentWidget } from "@/features/dashboard/components/investment-widget"
import { useDashboard } from "@/features/dashboard/hooks/use-dashboard"
import { MonthNavigator } from "@/features/transactions/components/month-navigator"
import { TransactionList } from "@/features/transactions/components/transaction-list"
import { formatKrw } from "@/lib/format"

function currentYm(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

/**
 * 홈 — get_dashboard RPC 1왕복 (PRD §3.1, API.md §8.1).
 * 비대칭 요약(이번 달 지출 hero) + 순자산·총잔액 + 캘린더 + 예산/투자 위젯 + 최근 거래.
 */
export function HomeScreen() {
  const [ym, setYm] = useState(currentYm)
  const dashboardQuery = useDashboard(ym)
  const data = dashboardQuery.data

  if (dashboardQuery.isPending) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pt-6" aria-busy>
        <div className="h-28 animate-pulse rounded-xl bg-surface-sunken" aria-hidden />
        <div className="h-64 animate-pulse rounded-xl bg-surface-sunken" aria-hidden />
        <div className="h-40 animate-pulse rounded-xl bg-surface-sunken" aria-hidden />
      </main>
    )
  }

  if (dashboardQuery.isError || !data) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col items-center gap-3 px-4 pt-16">
        <p className="text-sm text-ink-muted">대시보드를 불러오지 못했습니다</p>
        <button
          type="button"
          onClick={() => dashboardQuery.refetch()}
          className="flex h-11 items-center rounded-xl bg-ink px-5 text-sm font-medium text-surface-raised"
        >
          다시 시도
        </button>
      </main>
    )
  }

  const net = data.monthlyIncome - data.monthlyExpense

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pt-4">
      <MonthNavigator ym={ym} onChange={setYm} />

      <section aria-labelledby="summary-heading" className="flex flex-col gap-4 px-1">
        <h1 id="summary-heading" className="sr-only">
          이번 달 요약
        </h1>
        <div>
          <p className="text-xs text-ink-muted">이번 달 지출</p>
          <p
            className="amount text-[length:var(--text-amount-hero)] font-bold leading-tight text-ink"
            data-testid="dashboard-expense"
          >
            {formatKrw(data.monthlyExpense)}
          </p>
        </div>
        <div className="flex gap-8">
          <div>
            <p className="text-xs text-ink-muted">수입</p>
            <p
              className="amount text-[length:var(--text-amount-md)] font-semibold text-income-fg"
              data-testid="dashboard-income"
            >
              {formatKrw(data.monthlyIncome)}
            </p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">순수익</p>
            <p className="amount text-[length:var(--text-amount-md)] font-semibold text-ink">
              {formatKrw(net)}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-surface-raised p-3 ring-1 ring-hairline">
            <p className="text-xs text-ink-muted">순자산</p>
            <p className="amount text-[length:var(--text-amount-md)] font-semibold text-ink">
              {formatKrw(data.netWorth)}
            </p>
          </div>
          <div className="rounded-xl bg-surface-raised p-3 ring-1 ring-hairline">
            <p className="text-xs text-ink-muted">총 잔액 · 계좌 {data.accountCount}개</p>
            <p
              className="amount text-[length:var(--text-amount-md)] font-semibold text-ink"
              data-testid="dashboard-total-balance"
            >
              {formatKrw(data.totalBalance)}
            </p>
          </div>
        </div>
      </section>

      {data.accountCount === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl bg-surface-raised py-10 ring-1 ring-hairline">
          <p className="text-sm text-ink-muted">시작하려면 먼저 계좌를 만들어주세요</p>
          <Link
            href="/accounts"
            className="flex h-11 items-center rounded-xl bg-ink px-5 text-sm font-medium text-surface-raised"
          >
            계좌 만들기
          </Link>
        </div>
      )}

      <section aria-label="거래 캘린더" className="flex flex-col gap-2">
        <h2 className="px-1 text-sm font-semibold text-ink">거래 캘린더</h2>
        <CalendarWidget ym={ym} dailyTotals={data.dailyTotals} />
      </section>

      <section aria-label="예산·투자" className="grid grid-cols-2 gap-2">
        <BudgetUsageWidget budget={data.budget} />
        <InvestmentWidget investment={data.investment} />
      </section>

      <section aria-label="최근 거래" className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold text-ink">최근 거래</h2>
          <Link href="/transactions" className="flex min-h-11 items-center text-xs text-ink-muted">
            전체 보기 →
          </Link>
        </div>
        <TransactionList items={data.recentTransactions} onSelect={() => {}} />
      </section>
    </main>
  )
}
