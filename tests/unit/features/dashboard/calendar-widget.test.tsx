// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"

import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { CalendarWidget } from "@/features/dashboard/components/calendar-widget"
import type { DailyTotalDto } from "@/types/api"

/**
 * 거래 캘린더 날짜 클릭 — 홈 화면 "최근 거래" 영역을 해당 날짜 거래로
 * 치환하기 위한 선택 상태 (기능 2, 사용자 확정 스펙).
 */

const DAILY_TOTALS: DailyTotalDto[] = [
  { date: "2026-07-03", income: 0, expense: 12000 },
  { date: "2026-07-10", income: 500000, expense: 0 },
]

describe("CalendarWidget", () => {
  it("월에 속한 날짜 셀은 버튼으로 렌더된다", () => {
    render(
      <CalendarWidget
        ym="2026-07"
        dailyTotals={DAILY_TOTALS}
        selectedDate={null}
        onDateSelect={vi.fn()}
      />,
    )

    // 2026-07은 31일 — 빈 셀(leadingBlanks)은 버튼이 아니어야 한다
    expect(screen.getAllByRole("button")).toHaveLength(31)
  })

  it("날짜 셀에는 사람이 읽는 한국어 aria-label이 붙는다", () => {
    render(
      <CalendarWidget
        ym="2026-07"
        dailyTotals={DAILY_TOTALS}
        selectedDate={null}
        onDateSelect={vi.fn()}
      />,
    )

    expect(
      screen.getByRole("button", { name: "7월 3일 거래 보기" }),
    ).toBeInTheDocument()
  })

  it("날짜 셀 클릭 시 onDateSelect가 해당 날짜(YYYY-MM-DD)로 호출된다", () => {
    const onDateSelect = vi.fn()
    render(
      <CalendarWidget
        ym="2026-07"
        dailyTotals={DAILY_TOTALS}
        selectedDate={null}
        onDateSelect={onDateSelect}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "7월 3일 거래 보기" }))

    expect(onDateSelect).toHaveBeenCalledWith("2026-07-03")
  })

  it("이미 선택된 날짜를 재클릭하면 onDateSelect(null)로 토글 해제된다", () => {
    const onDateSelect = vi.fn()
    render(
      <CalendarWidget
        ym="2026-07"
        dailyTotals={DAILY_TOTALS}
        selectedDate="2026-07-03"
        onDateSelect={onDateSelect}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "7월 3일 거래 보기" }))

    expect(onDateSelect).toHaveBeenCalledWith(null)
  })

  it("선택된 날짜 셀은 aria-pressed=true, 나머지는 false", () => {
    render(
      <CalendarWidget
        ym="2026-07"
        dailyTotals={DAILY_TOTALS}
        selectedDate="2026-07-03"
        onDateSelect={vi.fn()}
      />,
    )

    expect(
      screen.getByRole("button", { name: "7월 3일 거래 보기" }),
    ).toHaveAttribute("aria-pressed", "true")
    expect(
      screen.getByRole("button", { name: "7월 10일 거래 보기" }),
    ).toHaveAttribute("aria-pressed", "false")
  })

  it("최소 터치 타겟(44px) 클래스를 유지한다", () => {
    render(
      <CalendarWidget
        ym="2026-07"
        dailyTotals={DAILY_TOTALS}
        selectedDate={null}
        onDateSelect={vi.fn()}
      />,
    )

    expect(
      screen.getByRole("button", { name: "7월 3일 거래 보기" }),
    ).toHaveClass("min-h-11")
  })

  /**
   * MED-2 (리뷰 반영): 버튼이 된 날짜 셀은 `div`였을 때와 달리 실제 오탭 위험이 있다.
   * jsdom은 실제 레이아웃 엔진이 없어 렌더된 픽셀 폭을 측정할 수 없으므로(getBoundingClientRect
   * 는 항상 0을 반환), 폭을 늘리는 실제 메커니즘(그리드 셀을 꽉 채우는 `w-full` + 카드의 좌우
   * 패딩 제거)이 클래스에 반영됐는지로 대신 검증한다. 실측 폭은 Tailwind 토큰 산술로
   * 홈 화면 컨테이너 체인(main px-4 → 캘린더 카드 padding → grid-cols-7, gap-x 0)을 따라
   * 계산해 보고서에 남긴다 — 320px: (320 - 32 - 0) / 7 ≈ 41.14px, 375px: (375 - 32 - 0) / 7 = 49px.
   * 320px는 44px 미만이며, 이는 앱 전역 좌우 거터(main px-4 = 16px × 2)를 유지하는 한 7열
   * 캘린더가 넘을 수 없는 기하학적 한계다(캘린더 카드 자체 패딩은 이미 0으로 최대 확보).
   */
  it("날짜 셀은 그리드 칸을 꽉 채우도록 w-full을 쓴다 (히트 영역 확보)", () => {
    render(
      <CalendarWidget
        ym="2026-07"
        dailyTotals={DAILY_TOTALS}
        selectedDate={null}
        onDateSelect={vi.fn()}
      />,
    )

    expect(
      screen.getByRole("button", { name: "7월 3일 거래 보기" }),
    ).toHaveClass("w-full")
  })

  it("캘린더 카드는 좌우 패딩 없이 폭을 최대로 확보한다 (모바일 히트 영역 개선)", () => {
    render(
      <CalendarWidget
        ym="2026-07"
        dailyTotals={DAILY_TOTALS}
        selectedDate={null}
        onDateSelect={vi.fn()}
      />,
    )

    const card = screen.getByTestId("dashboard-calendar")
    expect(card).toHaveClass("py-3")
    expect(card).not.toHaveClass("p-3")
    expect(card).not.toHaveClass("px-3")
  })
})
