"use client"

import {
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useMemo } from "react"
import { useMonthlySettlement } from "@/hooks/use-settlement"
import { useBudgets, useBudgetDetail } from "@/hooks/use-budget"
import { formatCurrency } from "@/lib/utils"
import { BudgetComparison } from "@/components/budget/BudgetComparison"
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
  const { data: budgets } = useBudgets(year)
  const currentBudget = budgets?.find((b) => b.month === month) ?? null
  const { data: budgetDetail } = useBudgetDetail(currentBudget?.id ?? null)

  const consumptionExpenses = useMemo(
    () => data?.expenseByCategory.filter((c) => c.expenseKind !== "saving") ?? [],
    [data?.expenseByCategory],
  )
  const savingExpenses = useMemo(
    () => data?.expenseByCategory.filter((c) => c.expenseKind === "saving") ?? [],
    [data?.expenseByCategory],
  )
  const consumptionTotal = useMemo(
    () => consumptionExpenses.reduce((sum, c) => sum + c.amount, 0),
    [consumptionExpenses],
  )
  const savingTotal = useMemo(
    () => savingExpenses.reduce((sum, c) => sum + c.amount, 0),
    [savingExpenses],
  )

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
          title="소비성 지출"
          data={consumptionExpenses}
          total={consumptionTotal}
          colorClass="text-rose-600"
        />
      </div>
      {savingExpenses.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <CategoryPieChart
            title="저축/투자 지출"
            data={savingExpenses}
            total={savingTotal}
            colorClass="text-amber-600"
          />
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-base">지출 요약</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">소비성 지출</span>
                <span className="font-mono text-sm text-rose-600">{formatCurrency(consumptionTotal)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">저축/투자 지출</span>
                <span className="font-mono text-sm text-amber-600">{formatCurrency(savingTotal)}</span>
              </div>
              <div className="border-t pt-2 flex items-center justify-between">
                <span className="text-sm font-medium">지출 총합</span>
                <span className="font-mono text-sm font-semibold text-rose-600">{formatCurrency(data.totalExpense)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 예산 vs 실적 비교 차트 */}
      {budgetDetail && budgetDetail.items.length > 0 && (
        <BudgetComparison
          items={budgetDetail.items}
          actualCategories={data.expenseByCategory}
        />
      )}

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
