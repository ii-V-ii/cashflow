"use client"

import { useMemo } from "react"
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
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
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCurrency } from "@/lib/utils"
import { useCategoryAnalysis } from "@/hooks/use-reports"

const COLORS = [
  "#ef4444",
  "#f59e0b",
  "#3b82f6",
  "#22c55e",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#f97316",
  "#14b8a6",
  "#6366f1",
]

interface CategoryDonutProps {
  year: number
  month: number
}

export function CategoryDonut({ year, month }: CategoryDonutProps) {
  const { data, isLoading } = useCategoryAnalysis(year, month)

  const chartData = useMemo(
    () =>
      data?.items.map((item, i) => ({
        name: item.categoryName,
        value: item.amount,
        color: COLORS[i % COLORS.length],
      })) ?? [],
    [data],
  )

  if (isLoading) {
    return <Skeleton className="h-96" />
  }

  if (!data || data.items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>카테고리별 지출 분석</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-8 text-center text-sm text-muted-foreground">
            해당 기간의 지출 데이터가 없습니다.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>카테고리별 지출 분석</span>
          <span className="text-base font-mono text-rose-600">
            {formatCurrency(data.totalExpense)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              dataKey="value"
              paddingAngle={2}
            >
              {chartData.map((entry, index) => (
                <Cell key={index} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => [formatCurrency(Number(value)), ""]}
            />
          </PieChart>
        </ResponsiveContainer>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">순위</TableHead>
              <TableHead>카테고리</TableHead>
              <TableHead className="text-right">금액</TableHead>
              <TableHead className="text-right">비중</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((item, i) => (
              <TableRow key={item.categoryId}>
                <TableCell>
                  <Badge
                    variant={i < 3 ? "default" : "outline"}
                    className="size-6 justify-center p-0 text-xs"
                  >
                    {item.rank}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div
                      className="size-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: COLORS[i % COLORS.length] }}
                    />
                    <span className="text-sm">{item.categoryName}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatCurrency(item.amount)}
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">
                  {item.ratio.toFixed(1)}%
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
