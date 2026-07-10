"use client"

import { useMemo, useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { YearNavigator } from "@/features/budgets/components/year-navigator"
import { useBudgetSummary } from "@/features/budgets/hooks/use-budgets"
import { formatKrw } from "@/lib/format"
import { cn } from "@/lib/utils"

const KIND_TABS = [
  { value: "expense", label: "지출" },
  { value: "income", label: "수입" },
] as const

type Kind = (typeof KIND_TABS)[number]["value"]

const compactKrw = new Intl.NumberFormat("ko-KR", {
  notation: "compact",
  maximumFractionDigits: 1,
})

/** 연간 개요 — 예산 대비 실적 추이 차트 (PRD §3.5, API.md §6.10) */
export function AnnualOverview({
  year,
  onYearChange,
}: {
  year: number
  onYearChange: (year: number) => void
}) {
  const [kind, setKind] = useState<Kind>("expense")
  const summaryQuery = useBudgetSummary(year)

  const { chartData, plannedSum, actualSum } = useMemo(() => {
    const months = summaryQuery.data?.months ?? []
    const data = months.map((month) => ({
      name: `${month.month}월`,
      계획: kind === "expense" ? month.plannedExpense : month.plannedIncome,
      실적: kind === "expense" ? month.actualExpense : month.actualIncome,
    }))
    return {
      chartData: data,
      plannedSum: data.reduce((sum, row) => sum + row.계획, 0),
      actualSum: data.reduce((sum, row) => sum + row.실적, 0),
    }
  }, [summaryQuery.data, kind])

  return (
    <section aria-label="연간 개요" className="flex flex-col gap-4">
      <YearNavigator year={year} onChange={onYearChange} />

      <div className="flex gap-1.5" role="group" aria-label="유형 필터">
        {KIND_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setKind(tab.value)}
            aria-pressed={kind === tab.value}
            className={cn(
              "min-h-9 rounded-full border px-3.5 text-sm transition-colors",
              kind === tab.value
                ? "border-ink bg-ink text-surface-raised"
                : "border-hairline bg-surface-raised text-ink-muted",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-hairline bg-surface-raised px-4 py-3">
          <p className="text-xs text-ink-muted">연간 계획</p>
          <p className="mt-1 text-lg font-semibold text-ink tabular-nums" data-testid="overview-planned-total">
            {formatKrw(plannedSum)}
          </p>
        </div>
        <div className="rounded-2xl border border-hairline bg-surface-raised px-4 py-3">
          <p className="text-xs text-ink-muted">연간 실적</p>
          <p className="mt-1 text-lg font-semibold text-ink tabular-nums" data-testid="overview-actual-total">
            {formatKrw(actualSum)}
          </p>
        </div>
      </div>

      {summaryQuery.isPending ? (
        <div className="h-72 animate-pulse rounded-2xl bg-surface-sunken" aria-hidden />
      ) : (
        <div className="rounded-2xl border border-hairline bg-surface-raised p-4">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={(value: number) => compactKrw.format(value)}
              />
              <Tooltip formatter={(value) => formatKrw(Number(value))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="계획" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="실적" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}
