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
import { formatCurrency } from "@/lib/utils"
import type { CategorySubtotal } from "@/types"

const COLORS = [
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#f97316",
  "#14b8a6",
  "#6366f1",
]

interface CategoryPieChartProps {
  title: string
  data: readonly CategorySubtotal[]
  total: number
  colorClass?: string
}

export function CategoryPieChart({
  title,
  data,
  total,
  colorClass = "",
}: CategoryPieChartProps) {
  const chartData = useMemo(
    () =>
      data.map((item, i) => ({
        name: item.categoryName,
        value: item.amount,
        color: COLORS[i % COLORS.length],
      })),
    [data],
  )

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">데이터가 없습니다.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>{title}</span>
          <span className={`font-mono ${colorClass}`}>
            {formatCurrency(total)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
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
              <TableHead>카테고리</TableHead>
              <TableHead className="text-right">금액</TableHead>
              <TableHead className="text-right">비중</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item, i) => {
              const ratio = total > 0 ? (item.amount / total) * 100 : 0
              return (
                <TableRow key={item.categoryId}>
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
                    {ratio.toFixed(1)}%
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
