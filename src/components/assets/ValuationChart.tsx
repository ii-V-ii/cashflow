"use client"

import { useMemo } from "react"
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
import { formatCurrency } from "@/lib/utils"
import type { AssetValuation } from "@/types"

interface ValuationChartProps {
  valuations: readonly AssetValuation[]
  acquisitionCost: number
}

export function ValuationChart({
  valuations,
  acquisitionCost,
}: ValuationChartProps) {
  const chartData = useMemo(() => {
    const sorted = [...valuations].sort(
      (a, b) => a.date.localeCompare(b.date),
    )
    return sorted.map((v) => ({
      date: formatShortDate(v.date),
      평가금액: v.value,
      취득원가: acquisitionCost,
    }))
  }, [valuations, acquisitionCost])

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">평가 이력</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-6 text-center text-sm text-muted-foreground">
            평가 이력이 없습니다.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">평가 이력</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart
            data={chartData}
            margin={{ left: 10, right: 10, top: 5, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" fontSize={12} />
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
            <Line
              type="monotone"
              dataKey="평가금액"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
            <Line
              type="monotone"
              dataKey="취득원가"
              stroke="#94a3b8"
              strokeWidth={1}
              strokeDasharray="5 5"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

function formatShortDate(date: string): string {
  const [y, m, d] = date.split("-")
  return `${y.slice(2)}.${m}.${d}`
}
