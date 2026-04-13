"use client"

import { useMemo } from "react"
import { PiggyBank } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useBudgets, useBudgetDetail } from "@/hooks/use-budget"
import { formatCurrency } from "@/lib/utils"

export function BudgetWidget() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  const { data: budgets, isLoading: budgetsLoading } = useBudgets(year)
  const currentBudget = budgets?.find((b) => b.month === month)
  const { data: detail, isLoading: detailLoading } = useBudgetDetail(
    currentBudget?.id ?? null,
  )

  const isLoading = budgetsLoading || detailLoading

  const overallRate = useMemo(() => {
    if (!detail?.items) return 0
    const totalPlanned = detail.items
      .filter((item) => item.categoryType === "expense")
      .reduce((sum, item) => sum + item.plannedAmount, 0)
    const totalActual = detail.items
      .filter((item) => item.categoryType === "expense")
      .reduce((sum, item) => sum + item.actualAmount, 0)
    return totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0
  }, [detail])

  const topCategories = useMemo(() => {
    if (!detail?.items) return []
    return detail.items
      .filter(
        (item) => item.categoryType === "expense" && item.plannedAmount > 0,
      )
      .sort((a, b) => b.achievementRate - a.achievementRate)
      .slice(0, 3)
  }, [detail])

  if (isLoading) {
    return <Skeleton className="h-48" />
  }

  if (!currentBudget) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PiggyBank className="size-4" />
            이번 달 예산
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {month}월 예산이 설정되지 않았습니다.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PiggyBank className="size-4" />
          {month}월 예산 소진율
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 전체 소진율 */}
        <div>
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">전체 지출</span>
            <span
              className={`font-mono font-medium ${
                overallRate > 100 ? "text-rose-600" : "text-foreground"
              }`}
            >
              {overallRate.toFixed(0)}%
            </span>
          </div>
          <UsageBar rate={overallRate} height="h-2" />
        </div>

        {/* 상위 3개 카테고리 */}
        {topCategories.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground">
              주요 카테고리
            </p>
            {topCategories.map((item) => (
              <div key={item.categoryId}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="truncate">{item.categoryName}</span>
                  <span className="ml-2 shrink-0 text-xs font-mono text-muted-foreground">
                    {formatCurrency(item.actualAmount)} /{" "}
                    {formatCurrency(item.plannedAmount)}
                  </span>
                </div>
                <UsageBar rate={item.achievementRate} height="h-1.5" />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function UsageBar({ rate, height }: { rate: number; height: string }) {
  const color =
    rate > 100 ? "bg-rose-500" : rate > 80 ? "bg-amber-500" : "bg-emerald-500"
  return (
    <div className={`${height} w-full overflow-hidden rounded-full bg-muted`}>
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${Math.min(rate, 100)}%` }}
      />
    </div>
  )
}
