"use client"

import { useMemo } from "react"

import type { DailyTotalDto } from "@/types/api"

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const

const compactKrw = new Intl.NumberFormat("ko-KR", {
  notation: "compact",
  maximumFractionDigits: 1,
})

interface CalendarWidgetProps {
  ym: string
  dailyTotals: DailyTotalDto[]
}

/**
 * 거래 캘린더 위젯 — 일자별 수입/지출 합계 (applied만, PRD §3.1).
 * 모바일 퍼스트 월 그리드: 지출은 -빨강, 수입은 +초록 축약 표기.
 */
export function CalendarWidget({ ym, dailyTotals }: CalendarWidgetProps) {
  const [year, month] = ym.split("-").map(Number)

  const { leadingBlanks, days, totalsByDate } = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1)
    const dayCount = new Date(year, month, 0).getDate()
    return {
      leadingBlanks: firstDay.getDay(),
      days: Array.from({ length: dayCount }, (_, index) => index + 1),
      totalsByDate: new Map(dailyTotals.map((day) => [day.date, day])),
    }
  }, [year, month, dailyTotals])

  return (
    <div
      className="rounded-xl bg-surface-raised p-3 ring-1 ring-hairline"
      data-testid="dashboard-calendar"
    >
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday} className="pb-1 text-[11px] font-medium text-ink-muted">
            {weekday}
          </span>
        ))}
        {Array.from({ length: leadingBlanks }, (_, index) => (
          <span key={`blank-${index}`} aria-hidden />
        ))}
        {days.map((day) => {
          const date = `${ym}-${String(day).padStart(2, "0")}`
          const totals = totalsByDate.get(date)
          return (
            <div key={date} className="flex min-h-11 flex-col items-center gap-0.5 pt-1">
              <span className="text-xs text-ink">{day}</span>
              {totals && totals.expense > 0 && (
                <span className="amount text-[10px] leading-tight text-expense-fg">
                  -{compactKrw.format(totals.expense)}
                </span>
              )}
              {totals && totals.income > 0 && (
                <span className="amount text-[10px] leading-tight text-income-fg">
                  +{compactKrw.format(totals.income)}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
