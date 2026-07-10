"use client"

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { formatKrw } from "@/lib/format"
import type { NetWorthPointDto } from "@/types/api"

const compactKrw = new Intl.NumberFormat("ko-KR", {
  notation: "compact",
  maximumFractionDigits: 0,
})

interface NetWorthChartProps {
  points: NetWorthPointDto[]
}

/** 순자산 추이 — 월말 시계열 영역 차트 (PRD §3.10). lazy 로드. */
export default function NetWorthChart({ points }: NetWorthChartProps) {
  return (
    <div className="h-56 w-full" data-testid="net-worth-chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--ink)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--ink)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tickFormatter={(date: string) => `${Number(date.slice(5, 7))}월`}
            tick={{ fontSize: 11, fill: "var(--ink-muted)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--hairline)" }}
          />
          <YAxis
            tickFormatter={(value: number) => compactKrw.format(value)}
            tick={{ fontSize: 10, fill: "var(--ink-muted)" }}
            tickLine={false}
            axisLine={false}
            width={48}
            domain={["auto", "auto"]}
          />
          <Tooltip
            formatter={(value) => [formatKrw(Number(value)), "순자산"]}
            labelFormatter={(date) => String(date)}
          />
          <Area
            type="monotone"
            dataKey="netWorth"
            stroke="var(--ink)"
            strokeWidth={2}
            fill="url(#netWorthFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
