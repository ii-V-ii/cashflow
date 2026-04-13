"use client"

import { useMemo } from "react"
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCurrency } from "@/lib/utils"
import { usePortfolioSummary } from "@/hooks/use-assets"

const COLORS = [
  "#3b82f6",
  "#22c55e",
  "#ef4444",
  "#f59e0b",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#f97316",
  "#14b8a6",
  "#6366f1",
]

export function PortfolioDonut() {
  const { data, isLoading } = usePortfolioSummary()

  const chartData = useMemo(
    () =>
      data?.byType.map((group, i) => ({
        name: group.label,
        value: group.value,
        color: COLORS[i % COLORS.length],
        ratio: group.ratio,
      })) ?? [],
    [data],
  )

  if (isLoading) {
    return <Skeleton className="h-72" />
  }

  if (!data || chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>포트폴리오 비중</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-8 text-center text-sm text-muted-foreground">
            자산 데이터가 없습니다.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>포트폴리오 비중</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={85}
              dataKey="value"
              paddingAngle={2}
            >
              {chartData.map((entry, index) => (
                <Cell key={index} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => [formatCurrency(Number(value)), ""]}
            />
          </PieChart>
        </ResponsiveContainer>

        <div className="grid grid-cols-2 gap-2">
          {chartData.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <div
                className="size-2.5 rounded-full shrink-0"
                style={{ backgroundColor: item.color }}
              />
              <span className="truncate">{item.name}</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                {item.ratio.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
