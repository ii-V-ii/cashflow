"use client"

import { useState, useMemo, useCallback } from "react"
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown } from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCurrency } from "@/lib/utils"
import { useInvestmentSummary, useInvestmentReturns } from "@/hooks/use-investments"

const MONTH_OPTIONS = [
  { label: "연간 전체", value: "0" },
  ...Array.from({ length: 12 }, (_, i) => ({
    label: `${i + 1}월`,
    value: String(i + 1),
  })),
]

export default function InvestmentsPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(0)

  const { data: summary, isLoading: summaryLoading } =
    useInvestmentSummary(year)
  const { data: returns, isLoading: returnsLoading } =
    useInvestmentReturns(year, month || undefined)

  const isLoading = summaryLoading || returnsLoading

  const handlePrevYear = useCallback(() => setYear((y) => y - 1), [])
  const handleNextYear = useCallback(() => setYear((y) => y + 1), [])

  // 월별 수익률 추이 차트 데이터
  const monthlyChartData = useMemo(() => {
    if (!returns) return []

    const byMonth = new Map<number, { dividend: number; realized: number; unrealized: number }>()
    for (const r of returns) {
      const existing = byMonth.get(r.month) ?? {
        dividend: 0,
        realized: 0,
        unrealized: 0,
      }
      byMonth.set(r.month, {
        dividend: existing.dividend + r.dividendIncome,
        realized: existing.realized + r.realizedGain,
        unrealized: existing.unrealized + r.unrealizedGain,
      })
    }

    return Array.from({ length: 12 }, (_, i) => {
      const data = byMonth.get(i + 1) ?? {
        dividend: 0,
        realized: 0,
        unrealized: 0,
      }
      return {
        name: `${i + 1}월`,
        배당수익: data.dividend,
        실현손익: data.realized,
        미실현손익: data.unrealized,
      }
    })
  }, [returns])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">투자 수익률</h1>

      {/* 기간 선택 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={handlePrevYear}
            aria-label="이전 연도"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-16 text-center text-sm font-semibold">
            {year}년
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={handleNextYear}
            aria-label="다음 연도"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <Select
          value={String(month)}
          onValueChange={(v) => {
            if (v) setMonth(Number(v))
          }}
        >
          <SelectTrigger className="w-32">
            <SelectValue>
              {(value: string) =>
                MONTH_OPTIONS.find((opt) => opt.value === value)?.label ?? ""
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {MONTH_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 포트폴리오 수익률 요약 */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : summary ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            title="총 투자원금"
            value={formatCurrency(summary.totalInvestedAmount)}
          />
          <SummaryCard
            title="배당수익"
            value={formatCurrency(summary.totalDividendIncome)}
            className="text-emerald-600"
          />
          <SummaryCard
            title="실현손익"
            value={formatCurrency(summary.totalRealizedGain)}
            className={
              summary.totalRealizedGain >= 0
                ? "text-emerald-600"
                : "text-rose-600"
            }
          />
          <SummaryCard
            title="평균 수익률"
            value={`${summary.averageReturnRate >= 0 ? "+" : ""}${summary.averageReturnRate.toFixed(2)}%`}
            className={
              summary.averageReturnRate >= 0
                ? "text-emerald-600"
                : "text-rose-600"
            }
            icon={
              summary.averageReturnRate >= 0 ? (
                <TrendingUp className="size-4" />
              ) : (
                <TrendingDown className="size-4" />
              )
            }
          />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          데이터를 불러올 수 없습니다.
        </p>
      )}

      {/* 월별 수익 추이 차트 */}
      {month === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{year}년 월별 수익 추이</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64" />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={monthlyChartData}
                  margin={{ left: 10, right: 10, top: 5, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis
                    tickFormatter={(v: number) =>
                      `${(v / 10000).toFixed(0)}만`
                    }
                    fontSize={12}
                  />
                  <Tooltip
                    formatter={(value, name) => [
                      formatCurrency(Number(value)),
                      String(name),
                    ]}
                  />
                  <Legend />
                  <Bar dataKey="배당수익" fill="#22c55e" stackId="income" />
                  <Bar dataKey="실현손익" fill="#3b82f6" stackId="income" />
                  <Bar dataKey="미실현손익" fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}

      {/* 자산별 수익률 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle>자산별 수익률</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-48" />
          ) : summary && summary.byAsset.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>자산명</TableHead>
                    <TableHead className="text-right">투자원금</TableHead>
                    <TableHead className="text-right">배당</TableHead>
                    <TableHead className="text-right">실현손익</TableHead>
                    <TableHead className="text-right">미실현손익</TableHead>
                    <TableHead className="text-right">수익률</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.byAsset.map((item) => (
                    <TableRow key={item.assetId}>
                      <TableCell className="font-medium">
                        {item.assetName}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatCurrency(item.totalInvestedAmount)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-emerald-600">
                        {formatCurrency(item.totalDividendIncome)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono text-sm ${
                          item.totalRealizedGain >= 0
                            ? "text-emerald-600"
                            : "text-rose-600"
                        }`}
                      >
                        {formatCurrency(item.totalRealizedGain)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono text-sm ${
                          item.totalUnrealizedGain >= 0
                            ? "text-emerald-600"
                            : "text-rose-600"
                        }`}
                      >
                        {formatCurrency(item.totalUnrealizedGain)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono text-sm font-medium ${
                          item.averageReturnRate >= 0
                            ? "text-emerald-600"
                            : "text-rose-600"
                        }`}
                      >
                        {item.averageReturnRate >= 0 ? "+" : ""}
                        {item.averageReturnRate.toFixed(2)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              해당 기간의 투자 수익 데이터가 없습니다.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function SummaryCard({
  title,
  value,
  className,
  icon,
}: {
  title: string
  value: string
  className?: string
  icon?: React.ReactNode
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-1.5">
          {icon}
          <p className={`text-xl font-bold font-mono ${className ?? ""}`}>
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
