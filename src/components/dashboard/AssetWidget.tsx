"use client"

import { useMemo } from "react"
import Link from "next/link"
import { Wallet, TrendingUp, TrendingDown } from "lucide-react"
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCurrency } from "@/lib/utils"
import { useAssets, usePortfolioSummary } from "@/hooks/use-assets"

const COLORS = [
  "#3b82f6",
  "#22c55e",
  "#ef4444",
  "#f59e0b",
  "#8b5cf6",
  "#06b6d4",
]

export function AssetWidget() {
  const { data: assets, isLoading: assetsLoading } = useAssets()
  const { data: portfolio, isLoading: portfolioLoading } =
    usePortfolioSummary()

  const isLoading = assetsLoading || portfolioLoading

  const miniChartData = useMemo(
    () =>
      portfolio?.byAssetCategory.map((group, i) => ({
        name: group.label,
        value: group.value,
        color: COLORS[i % COLORS.length],
      })) ?? [],
    [portfolio],
  )

  const totalValue = useMemo(
    () => (assets ?? []).reduce((sum, a) => sum + a.currentValue, 0),
    [assets],
  )

  const totalCost = useMemo(
    () => (assets ?? []).reduce((sum, a) => sum + a.acquisitionCost, 0),
    [assets],
  )

  const gain = totalValue - totalCost
  const returnRate = totalCost > 0 ? (gain / totalCost) * 100 : 0

  if (isLoading) {
    return <Skeleton className="h-48" />
  }

  if (!assets || assets.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="size-4" />
            순자산
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            등록된 자산이 없습니다.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Wallet className="size-4" />
            순자산
          </span>
          <Link
            href="/assets"
            className="text-xs font-normal text-muted-foreground hover:underline"
          >
            더보기
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-2xl font-bold font-mono">
            {formatCurrency(totalValue)}
          </p>
          <div className="flex items-center gap-1 mt-1">
            {gain >= 0 ? (
              <TrendingUp className="size-3.5 text-emerald-600" />
            ) : (
              <TrendingDown className="size-3.5 text-rose-600" />
            )}
            <span
              className={`text-sm font-mono ${
                gain >= 0 ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {formatCurrency(gain)} ({returnRate >= 0 ? "+" : ""}
              {returnRate.toFixed(1)}%)
            </span>
          </div>
        </div>

        {miniChartData.length > 0 && (
          <div className="flex items-center gap-4">
            <div className="size-20 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={miniChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={22}
                    outerRadius={36}
                    dataKey="value"
                    paddingAngle={2}
                  >
                    {miniChartData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col gap-1 min-w-0">
              {miniChartData.slice(0, 4).map((item, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs">
                  <div
                    className="size-2 rounded-full shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="truncate">{item.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
