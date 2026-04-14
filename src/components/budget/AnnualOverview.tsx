"use client"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { useAnnualBudgetSummary } from "@/hooks/use-budget"
import { formatCurrency } from "@/lib/utils"

interface AnnualOverviewProps {
  year: number
}

const MONTH_LABELS = [
  "1월",
  "2월",
  "3월",
  "4월",
  "5월",
  "6월",
  "7월",
  "8월",
  "9월",
  "10월",
  "11월",
  "12월",
]

export function AnnualOverview({ year }: AnnualOverviewProps) {
  const { data, isLoading } = useAnnualBudgetSummary(year)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-72" />
        <Skeleton className="h-80" />
      </div>
    )
  }

  if (!data) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        연간 예산 데이터를 불러올 수 없습니다.
      </p>
    )
  }

  const chartData = data.months.map((m) => ({
    name: MONTH_LABELS[m.month - 1],
    예산지출: m.plannedExpense,
    실적지출: m.actualExpense,
    예산수입: m.plannedIncome,
    실적수입: m.actualIncome,
  }))

  return (
    <div className="space-y-4">
      {/* 연간 합계 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="예산 수입" value={data.totalPlannedIncome} />
        <SummaryCard
          label="실적 수입"
          value={data.totalActualIncome}
          colorClass="text-emerald-600"
        />
        <SummaryCard label="예산 지출" value={data.totalPlannedExpense} />
        <SummaryCard
          label="실적 지출"
          value={data.totalActualExpense}
          colorClass="text-rose-600"
        />
      </div>

      {/* 월별 추이 차트 */}
      <Card>
        <CardHeader>
          <CardTitle>{year}년 월별 추이</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
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
                dataKey="예산지출"
                stroke="#94a3b8"
                strokeDasharray="5 5"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="실적지출"
                stroke="#ef4444"
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="예산수입"
                stroke="#d4d4d8"
                strokeDasharray="5 5"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="실적수입"
                stroke="#22c55e"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 12개월 상세 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle>{year}년 월별 상세</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>월</TableHead>
                <TableHead className="text-right">예산 수입</TableHead>
                <TableHead className="text-right">실적 수입</TableHead>
                <TableHead className="text-right text-emerald-600">수입 차이</TableHead>
                <TableHead className="text-right">예산 지출</TableHead>
                <TableHead className="text-right">실적 지출</TableHead>
                <TableHead className="text-right text-rose-600">지출 차이</TableHead>
                <TableHead className="text-right">순수익 차이</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.months.map((m) => {
                const incomeDiff = m.actualIncome - m.plannedIncome
                const expenseDiff = m.actualExpense - m.plannedExpense
                const netDiff = (m.actualIncome - m.actualExpense) - (m.plannedIncome - m.plannedExpense)

                const diffCell = (value: number, positiveIsGood: boolean) => {
                  const isGood = positiveIsGood ? value >= 0 : value <= 0
                  return (
                    <TableCell className={`text-right font-mono text-xs ${isGood ? "text-emerald-600" : "text-rose-600"}`}>
                      {value > 0 ? "+" : ""}{formatCurrency(value)}
                    </TableCell>
                  )
                }

                return (
                  <TableRow key={m.month}>
                    <TableCell className="font-medium">
                      {MONTH_LABELS[m.month - 1]}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {formatCurrency(m.plannedIncome)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-emerald-600">
                      {formatCurrency(m.actualIncome)}
                    </TableCell>
                    {diffCell(incomeDiff, true)}
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {formatCurrency(m.plannedExpense)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-rose-600">
                      {formatCurrency(m.actualExpense)}
                    </TableCell>
                    {diffCell(expenseDiff, false)}
                    {diffCell(netDiff, true)}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  colorClass = "",
}: {
  label: string
  value: number
  colorClass?: string
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-lg font-mono font-semibold ${colorClass}`}>
          {formatCurrency(value)}
        </div>
      </CardHeader>
    </Card>
  )
}
