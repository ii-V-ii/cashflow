"use client"

import { useMemo } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"
import type { BudgetItemWithActual, CategorySubtotal } from "@/types"


interface BudgetComparisonProps {
  items: readonly BudgetItemWithActual[]
  actualCategories?: readonly CategorySubtotal[]
}

interface FlatRow {
  name: string
  planned: number
  actual: number
}

export function BudgetComparison({ items, actualCategories }: BudgetComparisonProps) {
  const rows = useMemo(() => {
    const expenseItems = items.filter(
      (item) => item.categoryType === "expense",
    )

    const result: FlatRow[] = []
    const budgetCategoryIds = new Set(expenseItems.map((i) => i.categoryId))

    // 소분류 예산 항목이 있는 경우 해당 대분류 ID 수집 (actualCategories 중복 방지)
    const parentsOfBudgetedChildren = new Set<string>()
    for (const item of expenseItems) {
      if (item.categoryParentId) {
        parentsOfBudgetedChildren.add(item.categoryParentId)
      }
    }

    // 각 예산 항목을 개별 행으로 표시 (소분류 일관 표시)
    for (const item of expenseItems) {
      result.push({
        name: item.categoryName,
        planned: item.plannedAmount,
        actual: item.actualAmount,
      })
    }

    // 예산 없는 실적 카테고리 추가 (중복 방지)
    if (actualCategories) {
      for (const ac of actualCategories) {
        if (
          !budgetCategoryIds.has(ac.categoryId) &&
          !parentsOfBudgetedChildren.has(ac.categoryId) &&
          ac.amount > 0
        ) {
          result.push({
            name: ac.categoryName,
            planned: 0,
            actual: ac.amount,
          })
        }
      }
    }

    return result
  }, [items, actualCategories])

  const chartData = useMemo(
    () => rows.map((r) => ({ name: r.name, "예산": r.planned, "실적": r.actual })),
    [rows],
  )

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>예산 vs 실적</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            지출 예산 항목이 없습니다.
          </p>
        </CardContent>
      </Card>
    )
  }

  const chartHeight = Math.max(rows.length * 70, 200)

  return (
    <Card>
      <CardHeader>
        <CardTitle>예산 vs 실적 (지출)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ left: 10, right: 30, top: 5, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}만`}
              fontSize={12}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={70}
              tick={{ fontSize: 12 }}
            />
            <Tooltip
              formatter={(value, name) => [
                formatCurrency(Number(value)),
                String(name),
              ]}
            />
            <Bar
              dataKey="예산"
              fill="#94a3b8"
              radius={[0, 4, 4, 0]}
              barSize={16}
            />
            <Bar
              dataKey="실적"
              fill="#3b82f6"
              radius={[0, 4, 4, 0]}
              barSize={16}
            />
          </BarChart>
        </ResponsiveContainer>

        {/* 소진율 목록 */}
        <div className="space-y-1.5">
          {rows.map((row) => {
            const rate = row.planned > 0 ? Math.round((row.actual / row.planned) * 100) : 0
            const over = row.actual > row.planned

            return (
              <div
                key={row.name}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-muted-foreground">{row.name}</span>
                <span className={over ? "font-medium text-rose-600" : "font-medium text-emerald-600"}>
                  {rate}% 소진
                </span>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
