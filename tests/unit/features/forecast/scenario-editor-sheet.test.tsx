// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ScenarioEditorSheet } from "@/features/forecast/components/scenario-editor-sheet"

const onSubmit = vi.fn()

function renderSheet() {
  render(
    <ScenarioEditorSheet
      open
      onOpenChange={vi.fn()}
      onSubmit={onSubmit}
      isPending={false}
    />,
  )
}

function submitWithName(name: string) {
  fireEvent.change(screen.getByTestId("scenario-name-input"), {
    target: { value: name },
  })
  fireEvent.click(screen.getByTestId("save-scenario"))
}

describe("ScenarioEditorSheet 폼 파싱", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("증가율 미입력 → assumptions: null (기본 가정)", () => {
    renderSheet()
    submitWithName("기본")

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "기본", assumptions: null }),
    )
    // 기본 기간: 오늘 ~ +12개월 (YYYY-MM-DD)
    const input = onSubmit.mock.calls[0][0]
    expect(input.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(input.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(input.endDate > input.startDate).toBe(true)
  })

  it("수입 증가율만 입력 → 해당 값만 채운 assumptions", () => {
    renderSheet()
    fireEvent.change(screen.getByTestId("scenario-income-rate-input"), {
      target: { value: "3.5" },
    })
    submitWithName("성장 가정")

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        assumptions: { incomeGrowthRate: 3.5, expenseGrowthRate: undefined },
      }),
    )
  })

  it("음수 지출 변동율 입력을 허용한다 (지출 감소 가정)", () => {
    renderSheet()
    fireEvent.change(screen.getByTestId("scenario-expense-rate-input"), {
      target: { value: "-2" },
    })
    submitWithName("절약 가정")

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        assumptions: { incomeGrowthRate: undefined, expenseGrowthRate: -2 },
      }),
    )
  })

  it("숫자 외 문자는 증가율 입력에서 걸러진다", () => {
    renderSheet()
    const input = screen.getByTestId("scenario-income-rate-input")
    fireEvent.change(input, { target: { value: "abc3%" } })
    expect(input).toHaveValue("3")
  })
})
