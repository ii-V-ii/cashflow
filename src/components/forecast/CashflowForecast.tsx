"use client"

import { useMemo } from "react"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCurrency } from "@/lib/utils"
import type { ForecastSummary } from "@/types"

interface CashflowForecastProps {
  data: ForecastSummary | undefined
  isLoading: boolean
}

export function CashflowForecast({ data, isLoading }: CashflowForecastProps) {
  const chartData = useMemo(() => {
    if (!data?.results) return []
    return data.results.map((r) => ({
      name: r.date.slice(0, 7), // YYYY-MM
      수입: r.projectedIncome,
      지출: r.projectedExpense,
      잔액: r.projectedBalance,
    }))
  }, [data])

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[300px] w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (!data || chartData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <p>예측 데이터가 없습니다.</p>
        <p className="text-sm">시나리오를 선택하고 예측을 실행하세요.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Area Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">현금흐름 예측</CardTitle>
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
                <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
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
              <Area
                type="monotone"
                dataKey="잔액"
                stroke="#3b82f6"
                fill="url(#balanceGrad)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Monthly Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">월별 예상 수입/지출</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto -mx-4 px-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>월</TableHead>
                  <TableHead className="text-right">예상 수입</TableHead>
                  <TableHead className="text-right">예상 지출</TableHead>
                  <TableHead className="text-right">순이익</TableHead>
                  <TableHead className="text-right">누적 잔액</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.results.map((r) => {
                  const net = r.projectedIncome - r.projectedExpense
                  return (
                    <TableRow key={r.date}>
                      <TableCell className="text-muted-foreground">
                        {r.date.slice(0, 7)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-emerald-600">
                        {formatCurrency(r.projectedIncome)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-rose-600">
                        {formatCurrency(r.projectedExpense)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono font-medium ${
                          net >= 0 ? "text-emerald-600" : "text-rose-600"
                        }`}
                      >
                        {net >= 0 ? "+" : ""}
                        {formatCurrency(net)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(r.projectedBalance)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
