"use client"

import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { formatKrw } from "@/lib/format"
import type { ForecastResultDto } from "@/types/api"

/**
 * 예측 차트 2종 — 현금흐름(수입/지출 막대 + 누적 현금 선), 순자산 성장(면적).
 * recharts는 무거워 화면에서 dynamic import로 lazy 로드한다 (performance.md).
 */

interface ForecastChartsProps {
  results: ForecastResultDto[]
  goalAmount: number | null
  /** findGoalReachYm 결과 — 목표 도달 월 (PRD §3.9) */
  goalYm: string | null
}

const AXIS_TICK = { fontSize: 11 } as const

/** 축 라벨용 축약 (백만원 단위) */
function compactKrw(value: number): string {
  if (Math.abs(value) >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}억`
  if (Math.abs(value) >= 10_000) return `${Math.round(value / 10_000)}만`
  return String(value)
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
}) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-lg bg-surface-raised px-3 py-2 text-xs shadow-lg ring-1 ring-hairline">
      <p className="mb-1 font-medium text-ink">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="flex items-center gap-1.5 text-ink-muted">
          <span
            className="inline-block size-2 rounded-full"
            style={{ backgroundColor: entry.color }}
            aria-hidden
          />
          {entry.name} <span className="amount text-ink">{formatKrw(entry.value)}</span>
        </p>
      ))}
    </div>
  )
}

export default function ForecastCharts({
  results,
  goalAmount,
  goalYm,
}: ForecastChartsProps) {
  return (
    <div className="flex flex-col gap-6" data-testid="forecast-charts">
      <section aria-label="현금흐름 예측" className="flex flex-col gap-2">
        <h2 className="px-1 text-sm font-semibold text-ink">현금흐름 예측</h2>
        <div className="h-56 rounded-xl bg-surface-raised p-2 ring-1 ring-hairline">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={[...results]} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="ym" tick={AXIS_TICK} tickLine={false} axisLine={false} />
              <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} tickFormatter={compactKrw} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="projectedIncome" name="수입" fill="var(--chart-2)" radius={[3, 3, 0, 0]} maxBarSize={18} />
              <Bar dataKey="projectedExpense" name="지출" fill="var(--chart-5)" radius={[3, 3, 0, 0]} maxBarSize={18} />
              <Line dataKey="projectedCashflow" name="누적 현금" stroke="var(--chart-1)" strokeWidth={2} dot={false} type="monotone" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section aria-label="자산 성장 예측" className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold text-ink">자산 성장 예측</h2>
          {goalYm && (
            <span
              data-testid="goal-reach-badge"
              className="rounded-full bg-ink px-2.5 py-1 text-[11px] font-medium text-surface-raised"
            >
              목표 도달 {goalYm}
            </span>
          )}
        </div>
        <div className="h-56 rounded-xl bg-surface-raised p-2 ring-1 ring-hairline">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={[...results]} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="ym" tick={AXIS_TICK} tickLine={false} axisLine={false} />
              <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} tickFormatter={compactKrw} />
              <Tooltip content={<ChartTooltip />} />
              <Area
                dataKey="projectedNetWorth"
                name="예상 순자산"
                stroke="var(--chart-1)"
                fill="var(--chart-1)"
                fillOpacity={0.15}
                strokeWidth={2}
                type="monotone"
              />
              {goalAmount !== null && goalAmount > 0 && (
                <ReferenceLine
                  y={goalAmount}
                  stroke="var(--chart-4)"
                  strokeDasharray="4 4"
                  label={{ value: "목표", fontSize: 11, position: "insideTopRight" }}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  )
}
