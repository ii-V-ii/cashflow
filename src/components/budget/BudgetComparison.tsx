"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"
import type { BudgetItemWithActual } from "@/types"

interface BudgetComparisonProps {
  items: readonly BudgetItemWithActual[]
}

export function BudgetComparison({ items }: BudgetComparisonProps) {
  const expenseItems = items
    .filter((item) => item.categoryType === "expense" && item.plannedAmount > 0)
    .map((item) => ({
      name: item.categoryName,
      예산: item.plannedAmount,
      실적: item.actualAmount,
      rate: item.achievementRate,
      over: item.actualAmount > item.plannedAmount,
    }))

  if (expenseItems.length === 0) {
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

  const chartHeight = Math.max(expenseItems.length * 60, 200)

  return (
    <Card>
      <CardHeader>
        <CardTitle>예산 vs 실적 (지출)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            data={expenseItems}
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
            <Legend />
            <Bar
              dataKey="예산"
              fill="#94a3b8"
              radius={[0, 4, 4, 0]}
              barSize={16}
            />
            <Bar dataKey="실적" radius={[0, 4, 4, 0]} barSize={16}>
              {expenseItems.map((entry, index) => (
                <Cell
                  key={index}
                  fill={entry.over ? "#ef4444" : "#22c55e"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        <div className="space-y-1.5">
          {expenseItems.map((item) => (
            <div
              key={item.name}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-muted-foreground">{item.name}</span>
              <span
                className={
                  item.over
                    ? "font-medium text-rose-600"
                    : "font-medium text-emerald-600"
                }
              >
                {item.rate.toFixed(0)}% 소진
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
