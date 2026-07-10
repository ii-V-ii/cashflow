"use client"

import { MonthNavigator } from "@/features/transactions/components/month-navigator"
import { SettlementCategoryBars } from "@/features/settlements/components/settlement-category-bars"
import { useMonthlySettlement } from "@/features/settlements/hooks/use-settlements"
import { formatKrw, formatSignedKrw } from "@/lib/format"
import { cn } from "@/lib/utils"

interface MonthlySettlementViewProps {
  ym: string
  onYmChange: (ym: string) => void
}

/** 월별 결산 — 순수익 hero + 전월 대비 배지 + 카테고리 막대 + 계좌 변동 (PRD §3.6) */
export function MonthlySettlementView({ ym, onYmChange }: MonthlySettlementViewProps) {
  const query = useMonthlySettlement(ym)
  const data = query.data

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy>
        <MonthNavigator ym={ym} onChange={onYmChange} />
        <div className="h-28 animate-pulse rounded-xl bg-surface-sunken" aria-hidden />
        <div className="h-64 animate-pulse rounded-xl bg-surface-sunken" aria-hidden />
      </div>
    )
  }

  if (query.isError || !data) {
    return (
      <div className="flex flex-col items-center gap-3 pt-12">
        <p className="text-sm text-ink-muted">결산을 불러오지 못했습니다</p>
        <button
          type="button"
          onClick={() => query.refetch()}
          className="flex h-11 items-center rounded-xl bg-ink px-5 text-sm font-medium text-surface-raised"
        >
          다시 시도
        </button>
      </div>
    )
  }

  const isEmpty = data.income.total === 0 && data.expense.total === 0

  return (
    <div className="flex flex-col gap-6">
      <MonthNavigator ym={ym} onChange={onYmChange} />

      {isEmpty ? (
        <p className="rounded-xl bg-surface-raised py-12 text-center text-sm text-ink-muted ring-1 ring-hairline">
          거래가 없어 결산할 내역이 없습니다
        </p>
      ) : (
        <>
          <section aria-label="월 결산 요약" className="flex flex-col gap-3 px-1">
            <div>
              <p className="text-xs text-ink-muted">순수익</p>
              <div className="flex items-baseline gap-2">
                <p
                  className="amount text-[length:var(--text-amount-hero)] font-bold leading-tight text-ink"
                  data-testid="settlement-net"
                >
                  {formatKrw(data.net)}
                </p>
                <span
                  className={cn(
                    "amount rounded px-1.5 py-0.5 text-xs font-medium",
                    data.momComparison.netDiff >= 0
                      ? "bg-income-subtle text-income-fg"
                      : "bg-expense-subtle text-expense-fg",
                  )}
                  data-testid="settlement-mom-net"
                >
                  전월 대비 {formatSignedKrw(data.momComparison.netDiff)}
                </span>
              </div>
            </div>
            <div className="flex gap-8">
              <div>
                <p className="text-xs text-ink-muted">수입</p>
                <p
                  className="amount text-[length:var(--text-amount-md)] font-semibold text-income-fg"
                  data-testid="settlement-income"
                >
                  {formatKrw(data.income.total)}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-muted">지출 (저축 포함)</p>
                <p
                  className="amount text-[length:var(--text-amount-md)] font-semibold text-expense-fg"
                  data-testid="settlement-expense"
                >
                  {formatKrw(data.expense.total)}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-surface-raised p-3 ring-1 ring-hairline">
                <p className="text-xs text-ink-muted">소비</p>
                <p className="amount text-[length:var(--text-amount-sm)] font-semibold text-ink">
                  {formatKrw(data.expense.consumptionTotal)}
                </p>
              </div>
              <div className="rounded-xl bg-surface-raised p-3 ring-1 ring-hairline">
                <p className="text-xs text-ink-muted">저축</p>
                <p
                  className="amount text-[length:var(--text-amount-sm)] font-semibold text-saving-fg"
                  data-testid="settlement-saving"
                >
                  {formatKrw(data.expense.savingTotal)}
                </p>
              </div>
            </div>
          </section>

          <section aria-label="지출 구성" className="flex flex-col gap-1">
            <h2 className="px-1 text-sm font-semibold text-ink">지출 구성</h2>
            <div className="rounded-xl bg-surface-raised px-4 py-1 ring-1 ring-hairline">
              <SettlementCategoryBars items={data.expense.byCategory} />
            </div>
          </section>

          <section aria-label="수입 구성" className="flex flex-col gap-1">
            <h2 className="px-1 text-sm font-semibold text-ink">수입 구성</h2>
            <div className="rounded-xl bg-surface-raised px-4 py-1 ring-1 ring-hairline">
              <SettlementCategoryBars items={data.income.byCategory} />
            </div>
          </section>
        </>
      )}

      <section aria-label="계좌별 변동" className="flex flex-col gap-1">
        <h2 className="px-1 text-sm font-semibold text-ink">계좌별 변동</h2>
        <ul className="flex flex-col rounded-xl bg-surface-raised px-4 ring-1 ring-hairline">
          {data.accounts.length === 0 && (
            <li className="py-4 text-sm text-ink-muted">계좌가 없습니다</li>
          )}
          {data.accounts.map((account) => (
            <li
              key={account.accountId}
              className="flex min-h-12 items-center justify-between gap-2 border-b border-hairline py-2.5 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-ink">{account.name}</p>
                <p className="amount text-xs text-ink-muted">
                  {formatKrw(account.openingBalance)} → {formatKrw(account.closingBalance)}
                </p>
              </div>
              <span
                className={cn(
                  "amount shrink-0 text-[length:var(--text-amount-sm)] font-semibold",
                  account.change > 0 && "text-income-fg",
                  account.change < 0 && "text-expense-fg",
                  account.change === 0 && "text-ink-muted",
                )}
              >
                {formatSignedKrw(account.change)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
