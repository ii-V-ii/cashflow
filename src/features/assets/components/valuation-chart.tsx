"use client"

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { formatKrw } from "@/lib/format"
import type { ValuationDto } from "@/types/api"

/** 자산 평가 이력 시계열 차트 (PRD §3.7 상세). next/dynamic으로 lazy 로드된다. */
export default function ValuationChart({ valuations }: { valuations: ValuationDto[] }) {
  if (valuations.length === 0) return null

  return (
    <div className="h-52" data-testid="valuation-chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={valuations} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            tickFormatter={(date: string) => date.slice(5)}
            minTickGap={24}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            width={64}
            tickFormatter={(value: number) =>
              new Intl.NumberFormat("ko-KR", { notation: "compact" }).format(value)
            }
          />
          <Tooltip formatter={(value) => [formatKrw(Number(value)), "평가액"]} />
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--chart-1, #6366f1)"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
