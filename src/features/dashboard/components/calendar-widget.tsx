"use client"

import { useMemo } from "react"

import { cn } from "@/lib/utils"
import type { DailyTotalDto } from "@/types/api"

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const

const compactKrw = new Intl.NumberFormat("ko-KR", {
  notation: "compact",
  maximumFractionDigits: 1,
})

interface CalendarWidgetProps {
  ym: string
  dailyTotals: DailyTotalDto[]
  /** 선택된 날짜(YYYY-MM-DD) — 홈 화면이 "최근 거래" 영역을 이 날짜 거래로 치환한다 */
  selectedDate: string | null
  /** 날짜 셀 클릭 핸들러. 이미 선택된 날짜를 다시 클릭하면 null을 전달해 토글 해제한다 */
  onDateSelect: (date: string | null) => void
}

/**
 * 거래 캘린더 위젯 — 일자별 수입/지출 합계 (applied만, PRD §3.1).
 * 모바일 퍼스트 월 그리드: 지출은 -빨강, 수입은 +초록 축약 표기.
 * 날짜 셀 클릭 시 선택 상태를 부모(HomeScreen)로 올려 "최근 거래" 영역을
 * 해당 날짜 거래로 치환한다(기능 2). 그 달에 속하지 않는 빈 셀은 버튼화하지 않는다.
 */
export function CalendarWidget({
  ym,
  dailyTotals,
  selectedDate,
  onDateSelect,
}: CalendarWidgetProps) {
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
      // 좌우 패딩을 0으로 둬 320px 폭에서도 셀 폭을 최대로 확보한다(MED-2 리뷰 반영) —
      // main(px-4=16px×2) 거터를 유지하는 한 7열 캘린더가 320px에서 44px/셀을 넘지 못하는
      // 기하학적 한계가 남는다(320px: ~41.14px/셀, 375px: 49px/셀 — 계산은 컴포넌트 테스트 참조).
      className="rounded-xl bg-surface-raised py-3 ring-1 ring-hairline"
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
          const isSelected = date === selectedDate
          return (
            <button
              key={date}
              type="button"
              aria-pressed={isSelected}
              aria-label={`${month}월 ${day}일 거래 보기`}
              onClick={() => onDateSelect(isSelected ? null : date)}
              className={cn(
                "flex w-full min-h-11 flex-col items-center gap-0.5 rounded-lg pt-1 transition-colors",
                isSelected
                  ? "bg-ink/10 ring-2 ring-inset ring-ink"
                  : "hover:bg-surface-sunken/50",
              )}
            >
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
            </button>
          )
        })}
      </div>
    </div>
  )
}
