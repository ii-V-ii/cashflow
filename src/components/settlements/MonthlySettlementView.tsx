"use client"

import {
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react"
import { Card, CardHeader, CardDescription, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useMonthlySettlement } from "@/hooks/use-settlement"
import { formatCurrency } from "@/lib/utils"
import { CategoryPieChart } from "./CategoryPieChart"
import { AccountChangesTable } from "./AccountChangesTable"

interface MonthlySettlementViewProps {
  year: number
  month: number
}

export function MonthlySettlementView({
  year,
  month,
}: MonthlySettlementViewProps) {
  const { data, isLoading } = useMonthlySettlement(year, month)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
        <Skeleton className="h-48" />
      </div>
    )
  }

  if (!data) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        결산 데이터를 불러올 수 없습니다.
      </p>
    )
  }

  const prev = data.previousMonth

  return (
    <div className="space-y-4">
      {/* 요약 카드 */}
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label="수입"
          value={data.totalIncome}
          prevValue={prev?.totalIncome ?? null}
          icon={TrendingUp}
          colorClass="text-emerald-600"
        />
        <SummaryCard
          label="지출"
          value={data.totalExpense}
          prevValue={prev?.totalExpense ?? null}
          icon={TrendingDown}
          colorClass="text-rose-600"
        />
        <SummaryCard
          label="순수익"
          value={data.netIncome}
          prevValue={prev?.netIncome ?? null}
          icon={data.netIncome >= 0 ? TrendingUp : TrendingDown}
          colorClass={data.netIncome >= 0 ? "text-emerald-600" : "text-rose-600"}
        />
      </div>

      {/* 카테고리별 파이차트 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <CategoryPieChart
          title="카테고리별 수입"
          data={data.incomeByCategory}
          total={data.totalIncome}
          colorClass="text-emerald-600"
        />
        <CategoryPieChart
          title="카테고리별 지출"
          data={data.expenseByCategory}
          total={data.totalExpense}
          colorClass="text-rose-600"
        />
      </div>

      {/* 계좌별 변동 */}
      <AccountChangesTable data={data.accountChanges} />
    </div>
  )
}

function SummaryCard({
  label,
  value,
  prevValue,
  icon: Icon,
  colorClass,
}: {
  label: string
  value: number
  prevValue: number | null
  icon: React.ComponentType<{ className?: string }>
  colorClass: string
}) {
  const diff = prevValue !== null ? value - prevValue : null
  const diffPercent =
    diff !== null && prevValue !== null && prevValue !== 0
      ? ((diff / Math.abs(prevValue)) * 100).toFixed(1)
      : null

  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5">
          <Icon className="size-4" />
          {label}
        </CardDescription>
        <CardTitle className={`text-xl font-mono ${colorClass}`}>
          {formatCurrency(value)}
        </CardTitle>
        {diff !== null && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {diff > 0 ? (
              <ArrowUpRight className="size-3 text-emerald-500" />
            ) : diff < 0 ? (
              <ArrowDownRight className="size-3 text-rose-500" />
            ) : (
              <Minus className="size-3" />
            )}
            <span>
              전월 대비{" "}
              {diff !== 0
                ? `${diff > 0 ? "+" : ""}${formatCurrency(diff)} (${diffPercent}%)`
                : "변동 없음"}
            </span>
          </div>
        )}
      </CardHeader>
    </Card>
  )
}
