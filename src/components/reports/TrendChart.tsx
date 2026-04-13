"use client"

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCurrency } from "@/lib/utils"
import { useIncomeExpenseTrend } from "@/hooks/use-reports"

interface TrendChartProps {
  from: string
  to: string
}

export function TrendChart({ from, to }: TrendChartProps) {
  const { data, isLoading } = useIncomeExpenseTrend(from, to)

  if (isLoading) {
    return <Skeleton className="h-80" />
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>수입/지출 추이</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-8 text-center text-sm text-muted-foreground">
            해당 기간의 데이터가 없습니다.
          </p>
        </CardContent>
      </Card>
    )
  }

  const chartData = data.map((item) => ({
    name: formatYearMonth(item.yearMonth),
    수입: item.income,
    지출: item.expense,
    순수익: item.netIncome,
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>수입/지출 추이</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart
            data={chartData}
            margin={{ left: 10, right: 10, top: 5, bottom: 5 }}
          >
            <defs>
              <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" fontSize={12} />
            <YAxis
              tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}만`}
              fontSize={12}
            />
            <Tooltip
              formatter={(value, name) => [
                formatCurrency(Number(value)),
                String(name),
              ]}
            />
            <Legend />
            <Area
              type="monotone"
              dataKey="수입"
              stroke="#22c55e"
              fill="url(#incomeGrad)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="지출"
              stroke="#ef4444"
              fill="url(#expenseGrad)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

function formatYearMonth(ym: string): string {
  const [y, m] = ym.split("-")
  return `${y.slice(2)}.${m}`
}
