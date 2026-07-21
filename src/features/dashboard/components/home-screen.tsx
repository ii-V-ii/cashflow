"use client"

import Link from "next/link"
import { useState } from "react"

import { BudgetUsageWidget } from "@/features/dashboard/components/budget-usage-widget"
import { CalendarWidget } from "@/features/dashboard/components/calendar-widget"
import { InvestmentWidget } from "@/features/dashboard/components/investment-widget"
import { useDashboard } from "@/features/dashboard/hooks/use-dashboard"
import { MonthNavigator } from "@/features/transactions/components/month-navigator"
import { TRANSACTIONS_PAGE_SIZE } from "@/features/transactions/constants"
import { TransactionList } from "@/features/transactions/components/transaction-list"
import { useTransactionsList } from "@/features/transactions/hooks/use-transactions"
import { formatDateHeading, formatKrw, ymOf } from "@/lib/format"

function currentYm(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

/**
 * 홈 — get_dashboard RPC 1왕복 (PRD §3.1, API.md §8.1).
 * 비대칭 요약(이번 달 지출 hero) + 순자산·총잔액 + 캘린더 + 최근 거래(캘린더 날짜 클릭 시
 * 해당 날짜 거래로 치환) + 예산/투자 위젯. 날짜별 거래는 대시보드 RPC를 확장하지 않고
 * 기존 /api/v1/transactions(useTransactionsList)로 별도 왕복한다 — get_dashboard는
 * "1왕복" 계약을 유지한다.
 */
export function HomeScreen() {
  const [ym, setYm] = useState(currentYm)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const dashboardQuery = useDashboard(ym)
  const data = dashboardQuery.data

  // 날짜별 거래 — 기존 훅/쿼리키 재사용(qk.transactions.list). 미선택 시 요청하지 않는다.
  const selectedDateQuery = useTransactionsList(
    { from: selectedDate ?? undefined, to: selectedDate ?? undefined },
    1,
    TRANSACTIONS_PAGE_SIZE,
    selectedDate !== null,
  )

  function handleYmChange(nextYm: string): void {
    setYm(nextYm)
    setSelectedDate(null) // 다른 달의 날짜 선택이 남지 않도록 초기화
  }

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
      <MonthNavigator ym={ym} onChange={handleYmChange} />

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

      <section
        aria-label="거래 캘린더"
        className="flex flex-col gap-2"
        data-testid="calendar-section"
      >
        <h2 className="px-1 text-sm font-semibold text-ink">거래 캘린더</h2>
        <CalendarWidget
          ym={ym}
          dailyTotals={data.dailyTotals}
          selectedDate={selectedDate}
          onDateSelect={setSelectedDate}
        />
      </section>

      <section
        aria-label={selectedDate ? "선택 날짜 거래" : "최근 거래"}
        aria-live="polite"
        className="flex flex-col gap-2"
        data-testid="transactions-section"
      >
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold text-ink">
            {selectedDate ? `${formatDateHeading(selectedDate)} 거래` : "최근 거래"}
          </h2>
          {selectedDate ? (
            <button
              type="button"
              onClick={() => setSelectedDate(null)}
              className="flex min-h-11 items-center text-xs text-ink-muted"
            >
              최근 거래로 돌아가기
            </button>
          ) : (
            <Link href="/transactions" className="flex min-h-11 items-center text-xs text-ink-muted">
              전체 보기 →
            </Link>
          )}
        </div>

        {selectedDate ? (
          selectedDateQuery.isPending ? (
            <div className="h-40 animate-pulse rounded-xl bg-surface-sunken" aria-hidden />
          ) : selectedDateQuery.isError ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <p className="text-sm text-ink-muted">거래를 불러오지 못했습니다</p>
              <button
                type="button"
                onClick={() => selectedDateQuery.refetch()}
                className="flex h-11 items-center rounded-xl bg-ink px-5 text-sm font-medium text-surface-raised"
              >
                다시 시도
              </button>
            </div>
          ) : (
            <>
              <TransactionList
                items={selectedDateQuery.data?.items ?? []}
                onSelect={() => {}}
                emptyMessage="이 날의 거래가 없습니다"
              />
              {/* 하루 페이지 한도(TRANSACTIONS_PAGE_SIZE) 초과 시 절단 사실을 명시한다 —
                  전체 페이지네이션(YAGNI)까지는 만들지 않고, 해당 월 목록으로 안내한다. */}
              {(selectedDateQuery.data?.total ?? 0) >
                (selectedDateQuery.data?.items.length ?? 0) && (
                <div className="flex items-center justify-between px-1 text-xs text-ink-muted">
                  <p>
                    총 {selectedDateQuery.data?.total}건 중{" "}
                    {selectedDateQuery.data?.items.length}건 표시
                  </p>
                  <Link
                    href={`/transactions?ym=${ymOf(selectedDate)}`}
                    className="flex min-h-11 items-center text-ink-muted"
                  >
                    해당 월 전체 보기 →
                  </Link>
                </div>
              )}
            </>
          )
        ) : (
          <TransactionList items={data.recentTransactions} onSelect={() => {}} />
        )}
      </section>

      <section
        aria-label="예산·투자"
        className="grid grid-cols-2 gap-2"
        data-testid="budget-investment-section"
      >
        <BudgetUsageWidget budget={data.budget} />
        <InvestmentWidget investment={data.investment} />
      </section>
    </main>
  )
}
