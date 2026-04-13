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
} from "recharts"
import {
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react"
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
import { useAnnualSettlement } from "@/hooks/use-settlement"
import { formatCurrency } from "@/lib/utils"
import { CategoryPieChart } from "./CategoryPieChart"

const MONTH_LABELS = [
  "1월", "2월", "3월", "4월", "5월", "6월",
  "7월", "8월", "9월", "10월", "11월", "12월",
]

interface AnnualSettlementViewProps {
  year: number
}

export function AnnualSettlementView({ year }: AnnualSettlementViewProps) {
  const { data, isLoading } = useAnnualSettlement(year)

  const chartData = useMemo(
    () =>
      data?.months.map((m) => ({
        name: MONTH_LABELS[m.month - 1],
        수입: m.income,
        지출: m.expense,
        순수익: m.netIncome,
      })) ?? [],
    [data],
  )

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-72" />
        <Skeleton className="h-80" />
      </div>
    )
  }

  if (!data) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        연간 결산 데이터를 불러올 수 없습니다.
      </p>
    )
  }

  const prev = data.previousYear

  return (
    <div className="space-y-4">
      {/* 연간 합계 카드 */}
      <div className="grid gap-3 sm:grid-cols-3">
        <AnnualSummaryCard
          label="연간 수입"
          value={data.totalIncome}
          prevValue={prev?.totalIncome ?? null}
          colorClass="text-emerald-600"
        />
        <AnnualSummaryCard
          label="연간 지출"
          value={data.totalExpense}
          prevValue={prev?.totalExpense ?? null}
          colorClass="text-rose-600"
        />
        <AnnualSummaryCard
          label="연간 순수익"
          value={data.netIncome}
          prevValue={prev?.netIncome ?? null}
          colorClass={data.netIncome >= 0 ? "text-emerald-600" : "text-rose-600"}
        />
      </div>

      {/* 월별 추이 라인차트 */}
      <Card>
        <CardHeader>
          <CardTitle>{year}년 월별 수입/지출 추이</CardTitle>
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
                dataKey="수입"
                stroke="#22c55e"
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="지출"
                stroke="#ef4444"
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="순수익"
                stroke="#3b82f6"
                strokeDasharray="5 5"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 월별 상세 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle>{year}년 월별 상세</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>월</TableHead>
                <TableHead className="text-right">수입</TableHead>
                <TableHead className="text-right">지출</TableHead>
                <TableHead className="text-right">순수익</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.months.map((m) => (
                <TableRow key={m.month}>
                  <TableCell className="font-medium">
                    {MONTH_LABELS[m.month - 1]}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-emerald-600">
                    {formatCurrency(m.income)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-rose-600">
                    {formatCurrency(m.expense)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-mono text-sm font-medium ${
                      m.netIncome >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {m.netIncome >= 0 ? "+" : ""}
                    {formatCurrency(m.netIncome)}
                  </TableCell>
                </TableRow>
              ))}
              {/* 합계 행 */}
              <TableRow className="border-t-2 font-semibold">
                <TableCell>합계</TableCell>
                <TableCell className="text-right font-mono text-emerald-600">
                  {formatCurrency(data.totalIncome)}
                </TableCell>
                <TableCell className="text-right font-mono text-rose-600">
                  {formatCurrency(data.totalExpense)}
                </TableCell>
                <TableCell
                  className={`text-right font-mono ${
                    data.netIncome >= 0 ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {data.netIncome >= 0 ? "+" : ""}
                  {formatCurrency(data.netIncome)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 카테고리별 분석 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <CategoryPieChart
          title="연간 카테고리별 수입"
          data={data.incomeByCategory}
          total={data.totalIncome}
          colorClass="text-emerald-600"
        />
        <CategoryPieChart
          title="연간 카테고리별 지출"
          data={data.expenseByCategory}
          total={data.totalExpense}
          colorClass="text-rose-600"
        />
      </div>
    </div>
  )
}

function AnnualSummaryCard({
  label,
  value,
  prevValue,
  colorClass,
}: {
  label: string
  value: number
  prevValue: number | null
  colorClass: string
}) {
  const diff = prevValue !== null ? value - prevValue : null
  const diffPercent =
    diff !== null && prevValue !== null && prevValue !== 0
      ? ((diff / Math.abs(prevValue)) * 100).toFixed(1)
      : null

  return (
    <Card size="sm">
      <CardHeader>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-lg font-mono font-semibold ${colorClass}`}>
          {formatCurrency(value)}
        </div>
        {diff !== null && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {diff > 0 ? (
              <ArrowUpRight className="size-3 text-emerald-500" />
            ) : diff < 0 ? (
              <ArrowDownRight className="size-3 text-rose-500" />
            ) : (
              <Minus className="size-3" />
            )}
            <span>
              전년 대비{" "}
              {diff !== 0
                ? `${diff > 0 ? "+" : ""}${formatCurrency(diff)} (${diffPercent}%)`
                : "변동 없음"}
            </span>
          </div>
        )}
      </CardHeader>
    </Card>
  )
}
