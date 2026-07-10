"use client"

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"

import { formatKrw } from "@/lib/format"
import type { PortfolioDto } from "@/types/api"

const FALLBACK_COLORS = [
  "var(--chart-1, #6366f1)",
  "var(--chart-2, #22c55e)",
  "var(--chart-3, #f59e0b)",
  "var(--chart-4, #ec4899)",
  "var(--chart-5, #06b6d4)",
]

/** 포트폴리오 구성 도넛 — 카테고리별 비중 (PRD §3.7). next/dynamic으로 lazy 로드된다. */
export default function PortfolioDonut({ portfolio }: { portfolio: PortfolioDto }) {
  const data = portfolio.byCategory.filter((entry) => entry.value > 0)
  if (data.length === 0) return null

  return (
    <div className="h-48" data-testid="portfolio-donut">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="60%"
            outerRadius="90%"
            paddingAngle={2}
            strokeWidth={0}
          >
            {data.map((entry, index) => (
              <Cell
                key={entry.assetCategoryId}
                fill={entry.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, name) => [formatKrw(Number(value)), String(name)]}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
