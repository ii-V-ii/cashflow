"use client"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCurrency } from "@/lib/utils"
import { useNetWorthTrend } from "@/hooks/use-reports"

interface NetWorthChartProps {
  months: number
}

export function NetWorthChart({ months }: NetWorthChartProps) {
  const { data, isLoading } = useNetWorthTrend(months)

  if (isLoading) {
    return <Skeleton className="h-72" />
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>순자산 추이</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-8 text-center text-sm text-muted-foreground">
            순자산 데이터가 없습니다.
          </p>
        </CardContent>
      </Card>
    )
  }

  const chartData = data.map((point) => ({
    name: formatYearMonth(point.yearMonth),
    순자산: point.totalBalance,
  }))

  const latestBalance = data[data.length - 1].totalBalance

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>순자산 추이</span>
          <span className="text-base font-mono text-blue-600">
            {formatCurrency(latestBalance)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart
            data={chartData}
            margin={{ left: 10, right: 10, top: 5, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" fontSize={12} />
            <YAxis
              tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}만`}
              fontSize={12}
            />
            <Tooltip
              formatter={(value) => [formatCurrency(Number(value)), "순자산"]}
            />
            <Line
              type="monotone"
              dataKey="순자산"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

function formatYearMonth(ym: string): string {
  const [y, m] = ym.split("-")
  return `${y.slice(2)}.${m}`
}
