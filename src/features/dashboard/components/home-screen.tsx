"use client"

import Link from "next/link"

import { useAccounts } from "@/features/accounts/hooks/use-accounts"
import { useTransactionsMonth } from "@/features/transactions/hooks/use-transactions"
import { TransactionList } from "@/features/transactions/components/transaction-list"
import { formatKrw } from "@/lib/format"

function currentYm(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

/**
 * 홈 — 비대칭 요약(이번 달 지출 hero + 보조 지표) + 최근 거래 (UI.md §5 대시보드).
 * get_dashboard RPC는 대시보드 트랙에서 대체 — Phase 1은 기존 캐시 조합으로 구성.
 */
export function HomeScreen() {
  const ym = currentYm()
  const { data: accounts = [] } = useAccounts()
  const monthQuery = useTransactionsMonth(ym)

  const items = monthQuery.data?.items ?? []
  let income = 0
  let expense = 0
  for (const item of items) {
    if (item.type === "income") income += item.amount
    if (item.type === "expense") expense += item.amount
  }
  const totalBalance = accounts.reduce((sum, account) => sum + account.balance, 0)
  const recent = items.slice(0, 5)

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pt-6">
      <section aria-labelledby="summary-heading" className="flex flex-col gap-4 px-1">
        <h1 id="summary-heading" className="sr-only">
          이번 달 요약
        </h1>
        <div>
          <p className="text-xs text-ink-muted">이번 달 지출</p>
          <p className="amount text-[length:var(--text-amount-hero)] font-bold leading-tight text-ink">
            {formatKrw(expense)}
          </p>
        </div>
        <div className="flex gap-8">
          <div>
            <p className="text-xs text-ink-muted">수입</p>
            <p className="amount text-[length:var(--text-amount-md)] font-semibold text-income-fg">
              {formatKrw(income)}
            </p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">순수익</p>
            <p className="amount text-[length:var(--text-amount-md)] font-semibold text-ink">
              {formatKrw(income - expense)}
            </p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">총 잔액</p>
            <p className="amount text-[length:var(--text-amount-md)] font-semibold text-ink">
              {formatKrw(totalBalance)}
            </p>
          </div>
        </div>
      </section>

      {accounts.length === 0 && !monthQuery.isPending && (
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

      <section aria-label="최근 거래" className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold text-ink">최근 거래</h2>
          <Link href="/transactions" className="flex min-h-11 items-center text-xs text-ink-muted">
            전체 보기 →
          </Link>
        </div>
        {monthQuery.isPending ? (
          <div className="h-40 animate-pulse rounded-xl bg-surface-sunken" aria-hidden />
        ) : (
          <TransactionList items={recent} onSelect={() => {}} />
        )}
      </section>
    </main>
  )
}
