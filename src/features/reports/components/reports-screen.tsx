"use client"

import dynamic from "next/dynamic"
import { useRouter, useSearchParams } from "next/navigation"

import { MonthNavigator } from "@/features/transactions/components/month-navigator"
import {
  useCategoryReport,
  useNetWorthReport,
  useTrendReport,
} from "@/features/reports/hooks/use-reports"
import { formatKrw } from "@/lib/format"
import { cn } from "@/lib/utils"

/** Recharts는 무겁다 — next/dynamic lazy 로드로 초기 번들에서 제외 (성능 예산) */
const chartSkeleton = () => (
  <div className="h-56 animate-pulse rounded-lg bg-surface-sunken" aria-hidden />
)
const TrendChart = dynamic(() => import("./charts/trend-chart"), {
  ssr: false,
  loading: chartSkeleton,
})
const CategoryDonut = dynamic(() => import("./charts/category-donut"), {
  ssr: false,
  loading: chartSkeleton,
})
const NetWorthChart = dynamic(() => import("./charts/net-worth-chart"), {
  ssr: false,
  loading: chartSkeleton,
})

const PERIODS = [6, 12, 24] as const

function currentYm(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

/** ym 기준 최근 n개월 구간 ['YYYY-MM', 'YYYY-MM'] */
function rangeOf(to: string, months: number): { from: string; to: string } {
  const [year, month] = to.split("-").map(Number)
  const fromDate = new Date(year, month - 1 - (months - 1), 1)
  const from = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, "0")}`
  return { from, to }
}

/** 보고서 — 추이·카테고리 도넛·순자산 3종, 기간 세그먼트 + 핵심 수치 병기 (PRD §3.10) */
export function ReportsScreen() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const ym = searchParams.get("ym") ?? currentYm()
  const monthsParam = Number(searchParams.get("months") ?? "12")
  const months = (PERIODS as readonly number[]).includes(monthsParam) ? monthsParam : 12

  function setParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) params.delete(key)
      else params.set(key, value)
    }
    router.replace(`/reports?${params.toString()}`)
  }

  const { from, to } = rangeOf(ym, months)
  const trendQuery = useTrendReport(from, to)
  const categoryQuery = useCategoryReport(ym)
  const netWorthQuery = useNetWorthReport(months)

  const trendMonths = trendQuery.data?.months ?? []
  const trendHasData = trendMonths.some(
    (month) => month.income !== 0 || month.expense !== 0,
  )
  const latestTrend = trendMonths.at(-1)
  const netWorthPoints = netWorthQuery.data?.points ?? []
  const latestNetWorth = netWorthPoints.at(-1)

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pt-4">
      <div className="flex items-center justify-between gap-2 px-1">
        <h1 className="text-lg font-semibold text-ink">보고서</h1>
        <div role="group" aria-label="기간 선택" className="flex rounded-lg bg-surface-sunken p-0.5">
          {PERIODS.map((period) => (
            <button
              key={period}
              type="button"
              aria-pressed={months === period}
              onClick={() => setParams({ months: String(period) })}
              className={cn(
                "flex h-9 min-w-12 items-center justify-center rounded-md px-2.5 text-sm font-medium transition-colors",
                months === period
                  ? "bg-surface-raised text-ink shadow-sm"
                  : "text-ink-muted",
              )}
            >
              {period}개월
            </button>
          ))}
        </div>
      </div>

      <MonthNavigator ym={ym} onChange={(next) => setParams({ ym: next })} />

      <section aria-label="수입/지출 추이" className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-sm font-semibold text-ink">수입/지출 추이</h2>
          {latestTrend && (
            <p className="amount text-xs text-ink-muted">
              {Number(latestTrend.ym.slice(5))}월 순수익{" "}
              <span className="font-semibold text-ink">{formatKrw(latestTrend.net)}</span>
            </p>
          )}
        </div>
        <div className="rounded-xl bg-surface-raised p-3 ring-1 ring-hairline">
          {trendQuery.isPending ? (
            chartSkeleton()
          ) : !trendHasData ? (
            <p className="py-16 text-center text-sm text-ink-muted">
              이 기간에는 거래가 없습니다
            </p>
          ) : (
            <TrendChart months={trendMonths} />
          )}
        </div>
      </section>

      <section aria-label="카테고리별 지출" className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-sm font-semibold text-ink">카테고리별 지출</h2>
          {categoryQuery.data && (
            <p className="amount text-xs text-ink-muted">
              합계{" "}
              <span className="font-semibold text-ink">
                {formatKrw(categoryQuery.data.total)}
              </span>
            </p>
          )}
        </div>
        <div className="rounded-xl bg-surface-raised p-3 ring-1 ring-hairline">
          {categoryQuery.isPending ? (
            chartSkeleton()
          ) : !categoryQuery.data || categoryQuery.data.byCategory.length === 0 ? (
            <p className="py-16 text-center text-sm text-ink-muted">
              이 달에는 지출이 없습니다
            </p>
          ) : (
            <CategoryDonut items={categoryQuery.data.byCategory} />
          )}
        </div>
      </section>

      <section aria-label="순자산 추이" className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-sm font-semibold text-ink">순자산 추이</h2>
          {latestNetWorth && (
            <p className="amount text-xs text-ink-muted">
              현재{" "}
              <span className="font-semibold text-ink">
                {formatKrw(latestNetWorth.netWorth)}
              </span>
            </p>
          )}
        </div>
        <div className="rounded-xl bg-surface-raised p-3 ring-1 ring-hairline">
          {netWorthQuery.isPending ? (
            chartSkeleton()
          ) : netWorthPoints.length === 0 ? (
            <p className="py-16 text-center text-sm text-ink-muted">데이터가 없습니다</p>
          ) : (
            <NetWorthChart points={netWorthPoints} />
          )}
        </div>
      </section>
    </main>
  )
}
