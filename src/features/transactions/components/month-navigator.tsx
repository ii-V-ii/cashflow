"use client"

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

/** 월 네비게이터 — 터치 타겟 44px (UI.md §2.2) */
export function MonthNavigator({
  ym,
  onChange,
}: {
  ym: string
  onChange: (ym: string) => void
}) {
  const [year, month] = ym.split("-").map(Number)

  function shift(delta: number) {
    const date = new Date(year, month - 1 + delta, 1)
    onChange(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`)
  }

  return (
    <div className="flex items-center justify-center gap-1">
      <button
        type="button"
        onClick={() => shift(-1)}
        aria-label="이전 달"
        className="flex size-11 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-sunken"
      >
        <ChevronLeftIcon className="size-5" />
      </button>
      <h2 className="min-w-28 text-center text-base font-semibold text-ink" data-testid="current-month">
        {year}년 {month}월
      </h2>
      <button
        type="button"
        onClick={() => shift(1)}
        aria-label="다음 달"
        className="flex size-11 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-sunken"
      >
        <ChevronRightIcon className="size-5" />
      </button>
    </div>
  )
}
