"use client"

import Link from "next/link"
import { BarChart3, TrendingUp, TrendingDown } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCurrency } from "@/lib/utils"
import { useInvestmentSummary } from "@/hooks/use-investments"

export function InvestmentWidget() {
  const now = new Date()
  const year = now.getFullYear()
  const { data: summary, isLoading } = useInvestmentSummary(year)

  if (isLoading) {
    return <Skeleton className="h-48" />
  }

  if (!summary || summary.byAsset.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="size-4" />
            투자 수익률
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {year}년 투자 수익 데이터가 없습니다.
          </p>
        </CardContent>
      </Card>
    )
  }

  const totalReturn =
    summary.totalDividendIncome +
    summary.totalRealizedGain +
    summary.totalUnrealizedGain

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <BarChart3 className="size-4" />
            {year}년 투자 수익
          </span>
          <Link
            href="/investments"
            className="text-xs font-normal text-muted-foreground hover:underline"
          >
            더보기
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          {totalReturn >= 0 ? (
            <TrendingUp className="size-5 text-emerald-600" />
          ) : (
            <TrendingDown className="size-5 text-rose-600" />
          )}
          <p
            className={`text-xl font-bold font-mono ${
              totalReturn >= 0 ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            {formatCurrency(totalReturn)}
          </p>
        </div>

        <div className="space-y-2">
          <Row label="배당수익" value={summary.totalDividendIncome} />
          <Row label="실현손익" value={summary.totalRealizedGain} />
          <Row label="미실현손익" value={summary.totalUnrealizedGain} />
        </div>

        <div className="pt-2 border-t">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">평균 수익률</span>
            <span
              className={`font-mono font-medium ${
                summary.averageReturnRate >= 0
                  ? "text-emerald-600"
                  : "text-rose-600"
              }`}
            >
              {summary.averageReturnRate >= 0 ? "+" : ""}
              {summary.averageReturnRate.toFixed(2)}%
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`font-mono ${
          value >= 0 ? "text-emerald-600" : "text-rose-600"
        }`}
      >
        {formatCurrency(value)}
      </span>
    </div>
  )
}
