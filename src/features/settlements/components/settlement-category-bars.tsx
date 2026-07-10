"use client"

import { formatKrw } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { SettlementExpenseCategoryDto } from "@/types/api"

interface SettlementCategoryBarsProps {
  items: (SettlementExpenseCategoryDto | Omit<SettlementExpenseCategoryDto, "expenseKind">)[]
}

/** 카테고리 구성 막대 리스트 — 도넛보다 스캔이 빠른 형태 (UI.md §5 결산) */
export function SettlementCategoryBars({ items }: SettlementCategoryBarsProps) {
  if (items.length === 0) {
    return <p className="px-1 py-4 text-sm text-ink-muted">내역이 없습니다</p>
  }

  return (
    <ul className="flex flex-col">
      {items.map((item) => {
        const isSaving = "expenseKind" in item && item.expenseKind === "saving"
        return (
          <li
            key={item.categoryId ?? item.name}
            className="flex min-h-11 flex-col justify-center gap-1 border-b border-hairline py-2.5 last:border-b-0"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="flex items-center gap-1.5 text-sm text-ink">
                {item.name}
                {isSaving && (
                  <span className="rounded bg-saving-subtle px-1.5 py-0.5 text-[10px] font-medium text-saving-fg">
                    저축
                  </span>
                )}
              </span>
              <span className="amount text-[length:var(--text-amount-sm)] font-semibold text-ink">
                {formatKrw(item.amount)}
                <span className="pl-1.5 text-xs font-normal text-ink-muted">
                  {item.ratio}%
                </span>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
              <div
                className={cn(
                  "h-full rounded-full",
                  isSaving ? "bg-saving-fg" : "bg-ink",
                )}
                style={{ width: `${Math.min(item.ratio, 100)}%` }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
