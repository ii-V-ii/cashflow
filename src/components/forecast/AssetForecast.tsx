"use client"

import { useMemo } from "react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCurrency } from "@/lib/utils"
import type { ForecastSummary } from "@/types"

const ASSET_COLORS = [
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#f97316",
  "#14b8a6",
]

interface AssetForecastProps {
  data: ForecastSummary | undefined
  isLoading: boolean
  goalAmount?: number
}

export function AssetForecast({
  data,
  isLoading,
  goalAmount,
}: AssetForecastProps) {
  const { chartData, assetNames, goalReachDate } = useMemo(() => {
    if (!data?.results) {
      return { chartData: [], assetNames: [], goalReachDate: null }
    }

    const assetNameSet = new Set<string>()
    const chartData = data.results.map((r) => {
      const point: Record<string, unknown> = {
        name: r.date.slice(0, 7),
        순자산: r.projectedNetWorth,
      }
      if (r.details?.assetProjections) {
        for (const ap of r.details.assetProjections) {
          assetNameSet.add(ap.assetName)
          point[ap.assetName] = ap.projectedValue
        }
      }
      return point
    })

    let goalReachDate: string | null = null
    if (goalAmount && goalAmount > 0) {
      const match = data.results.find(
        (r) => r.projectedNetWorth >= goalAmount,
      )
      if (match) {
        goalReachDate = match.date.slice(0, 7)
      }
    }

    return {
      chartData,
      assetNames: Array.from(assetNameSet),
      goalReachDate,
    }
  }, [data, goalAmount])

  if (isLoading) {
    return <Skeleton className="h-[350px] w-full" />
  }

  if (chartData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <p>자산 예측 데이터가 없습니다.</p>
        <p className="text-sm">시나리오를 선택하고 예측을 실행하세요.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            순자산 추이 예측
            {goalReachDate && (
              <span className="ml-2 text-sm font-normal text-emerald-600">
                목표 도달 예상: {goalReachDate}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
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
                formatter={(value, name) => [
                  formatCurrency(Number(value)),
                  String(name),
                ]}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="순자산"
                stroke="#3b82f6"
                strokeWidth={3}
                dot={false}
              />
              {assetNames.map((name, i) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={ASSET_COLORS[i % ASSET_COLORS.length]}
                  strokeWidth={1.5}
                  strokeDasharray="4 2"
                  dot={false}
                />
              ))}
              {goalAmount && goalAmount > 0 && (
                <ReferenceLine
                  y={goalAmount}
                  stroke="#f59e0b"
                  strokeDasharray="8 4"
                  label={{
                    value: `목표: ${formatCurrency(goalAmount)}`,
                    position: "right",
                    fontSize: 11,
                    fill: "#f59e0b",
                  }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
