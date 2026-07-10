"use client"

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"

import { formatKrw } from "@/lib/format"
import type { CategoryReportItemDto } from "@/types/api"

/** 색 미지정 카테고리용 순환 팔레트 — 의미색과 겹치지 않는 잉크 톤 그라데이션 */
const FALLBACK_COLORS = [
  "oklch(45% 0.09 260)",
  "oklch(55% 0.1 200)",
  "oklch(60% 0.11 140)",
  "oklch(65% 0.12 80)",
  "oklch(55% 0.13 20)",
  "oklch(50% 0.1 320)",
] as const

interface CategoryDonutProps {
  items: CategoryReportItemDto[]
}

/** 카테고리별 지출 도넛 + 범례 리스트 결합 (UI.md §5 자산 참조 패턴). lazy 로드. */
export default function CategoryDonut({ items }: CategoryDonutProps) {
  const colorOf = (item: CategoryReportItemDto, index: number) =>
    item.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]

  return (
    <div className="flex flex-col gap-2" data-testid="category-donut">
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={items}
              dataKey="amount"
              nameKey="name"
              innerRadius="55%"
              outerRadius="85%"
              paddingAngle={2}
              strokeWidth={0}
            >
              {items.map((item, index) => (
                <Cell key={item.categoryId ?? item.name} fill={colorOf(item, index)} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => formatKrw(Number(value))} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex flex-col">
        {items.map((item, index) => (
          <li
            key={item.categoryId ?? item.name}
            className="flex min-h-10 items-center justify-between gap-2 border-b border-hairline last:border-b-0"
          >
            <span className="flex items-center gap-2 text-sm text-ink">
              <span
                aria-hidden
                className="size-2.5 rounded-full"
                style={{ backgroundColor: colorOf(item, index) }}
              />
              {item.name}
            </span>
            <span className="amount text-[length:var(--text-amount-sm)] font-semibold text-ink">
              {formatKrw(item.amount)}
              <span className="pl-1.5 text-xs font-normal text-ink-muted">
                {item.ratio}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
