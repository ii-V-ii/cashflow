"use client"

import {
  Bar,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { formatKrw } from "@/lib/format"
import type { TrendPointDto } from "@/types/api"

const compactKrw = new Intl.NumberFormat("ko-KR", {
  notation: "compact",
  maximumFractionDigits: 0,
})

interface TrendChartProps {
  months: TrendPointDto[]
}

/** 수입/지출 추이 — 월별 막대 + 순수익 선 (PRD §3.10). next/dynamic 로 lazy 로드. */
export default function TrendChart({ months }: TrendChartProps) {
  return (
    <div className="h-64 w-full" data-testid="trend-chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={months} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="ym"
            tickFormatter={(ym: string) => `${Number(ym.slice(5))}월`}
            tick={{ fontSize: 11, fill: "var(--ink-muted)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--hairline)" }}
          />
          <YAxis
            tickFormatter={(value: number) => compactKrw.format(value)}
            tick={{ fontSize: 10, fill: "var(--ink-muted)" }}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <Tooltip
            formatter={(value, name) => [
              formatKrw(Number(value)),
              name === "income" ? "수입" : name === "expense" ? "지출" : "순수익",
            ]}
            labelFormatter={(ym) => String(ym)}
          />
          <Bar dataKey="income" fill="var(--income-fg)" radius={[3, 3, 0, 0]} />
          <Bar dataKey="expense" fill="var(--expense-fg)" radius={[3, 3, 0, 0]} />
          <Line
            type="monotone"
            dataKey="net"
            stroke="var(--ink)"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
