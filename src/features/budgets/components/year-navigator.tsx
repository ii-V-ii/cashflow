"use client"

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

/** 연 네비게이터 — 터치 타겟 44px (UI.md §2.2) */
export function YearNavigator({
  year,
  onChange,
}: {
  year: number
  onChange: (year: number) => void
}) {
  return (
    <div className="flex items-center justify-center gap-1">
      <button
        type="button"
        onClick={() => onChange(year - 1)}
        aria-label="이전 해"
        className="flex size-11 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-sunken"
      >
        <ChevronLeftIcon className="size-5" />
      </button>
      <h2 className="min-w-24 text-center text-base font-semibold text-ink" data-testid="current-year">
        {year}년
      </h2>
      <button
        type="button"
        onClick={() => onChange(year + 1)}
        aria-label="다음 해"
        className="flex size-11 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-sunken"
      >
        <ChevronRightIcon className="size-5" />
      </button>
    </div>
  )
}
