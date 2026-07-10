"use client"

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { SettlementCategoryBars } from "@/features/settlements/components/settlement-category-bars"
import { useAnnualSettlement } from "@/features/settlements/hooks/use-settlements"
import { formatKrw } from "@/lib/format"
import { cn } from "@/lib/utils"

interface AnnualSettlementViewProps {
  year: number
  onYearChange: (year: number) => void
}

function YearNavigator({ year, onYearChange }: AnnualSettlementViewProps) {
  return (
    <div className="flex items-center justify-center gap-1">
      <button
        type="button"
        onClick={() => onYearChange(year - 1)}
        aria-label="이전 연도"
        className="flex size-11 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-sunken"
      >
        <ChevronLeftIcon className="size-5" />
      </button>
      <h2
        className="min-w-24 text-center text-base font-semibold text-ink"
        data-testid="current-year"
      >
        {year}년
      </h2>
      <button
        type="button"
        onClick={() => onYearChange(year + 1)}
        aria-label="다음 연도"
        className="flex size-11 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-sunken"
      >
        <ChevronRightIcon className="size-5" />
      </button>
    </div>
  )
}

/** 연간 결산 — 월별 추이 + 연간 합계 + 카테고리 연간 집계 (PRD §3.6, API.md §7.2) */
export function AnnualSettlementView({ year, onYearChange }: AnnualSettlementViewProps) {
  const query = useAnnualSettlement(year)
  const data = query.data

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy>
        <YearNavigator year={year} onYearChange={onYearChange} />
        <div className="h-64 animate-pulse rounded-xl bg-surface-sunken" aria-hidden />
      </div>
    )
  }

  if (query.isError || !data) {
    return (
      <div className="flex flex-col items-center gap-3 pt-12">
        <p className="text-sm text-ink-muted">연간 결산을 불러오지 못했습니다</p>
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

  const isEmpty = data.total.income === 0 && data.total.expense === 0

  return (
    <div className="flex flex-col gap-6">
      <YearNavigator year={year} onYearChange={onYearChange} />

      {isEmpty ? (
        <p className="rounded-xl bg-surface-raised py-12 text-center text-sm text-ink-muted ring-1 ring-hairline">
          거래가 없어 결산할 내역이 없습니다
        </p>
      ) : (
        <>
          <section aria-label="연간 합계" className="flex flex-col gap-3 px-1">
            <div>
              <p className="text-xs text-ink-muted">연간 순수익</p>
              <p
                className="amount text-[length:var(--text-amount-hero)] font-bold leading-tight text-ink"
                data-testid="annual-net"
              >
                {formatKrw(data.total.net)}
              </p>
            </div>
            <div className="flex gap-8">
              <div>
                <p className="text-xs text-ink-muted">수입</p>
                <p className="amount text-[length:var(--text-amount-md)] font-semibold text-income-fg">
                  {formatKrw(data.total.income)}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-muted">지출</p>
                <p className="amount text-[length:var(--text-amount-md)] font-semibold text-expense-fg">
                  {formatKrw(data.total.expense)}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-muted">저축</p>
                <p className="amount text-[length:var(--text-amount-md)] font-semibold text-saving-fg">
                  {formatKrw(data.total.saving)}
                </p>
              </div>
            </div>
          </section>

          <section aria-label="월별 추이" className="flex flex-col gap-1">
            <h2 className="px-1 text-sm font-semibold text-ink">월별 추이</h2>
            <ul className="flex flex-col rounded-xl bg-surface-raised px-4 ring-1 ring-hairline">
              {data.months.map((month) => (
                <li
                  key={month.month}
                  className="grid min-h-11 grid-cols-[2.5rem_1fr_1fr_1fr] items-center gap-2 border-b border-hairline py-2 last:border-b-0"
                >
                  <span className="text-sm text-ink-muted">{month.month}월</span>
                  <span className="amount text-right text-xs text-income-fg">
                    {formatKrw(month.income)}
                  </span>
                  <span className="amount text-right text-xs text-expense-fg">
                    {formatKrw(month.expense)}
                  </span>
                  <span
                    className={cn(
                      "amount text-right text-xs font-semibold",
                      month.net >= 0 ? "text-ink" : "text-expense-fg",
                    )}
                  >
                    {formatKrw(month.net)}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="카테고리별 연간 집계" className="flex flex-col gap-1">
            <h2 className="px-1 text-sm font-semibold text-ink">카테고리별 집계</h2>
            <div className="rounded-xl bg-surface-raised px-4 py-1 ring-1 ring-hairline">
              <SettlementCategoryBars
                items={data.byCategory.filter((item) => item.type === "expense")}
              />
            </div>
          </section>
        </>
      )}
    </div>
  )
}
