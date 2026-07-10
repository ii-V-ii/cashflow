// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { BudgetUsageWidget } from "@/features/dashboard/components/budget-usage-widget"
import { InvestmentWidget } from "@/features/dashboard/components/investment-widget"

/** 대시보드 예산 소진율·투자 요약 위젯 (API.md §8.1 — Phase 2 통합) */

describe("BudgetUsageWidget", () => {
  it("예산이 없으면 빈 상태와 예산 만들기 링크를 보여준다", () => {
    render(<BudgetUsageWidget budget={null} />)

    expect(screen.getByText("예산 소진율")).toBeInTheDocument()
    expect(screen.getByText("이번 달 예산이 없습니다")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "예산 만들기" })).toHaveAttribute(
      "href",
      "/budgets",
    )
  })

  it("소진율과 실지출/계획 금액, 프로그레스 바를 보여준다", () => {
    render(
      <BudgetUsageWidget
        budget={{ plannedTotal: 300_000, actualTotal: 150_000, ratio: 50 }}
      />,
    )

    expect(screen.getByText("50%")).toBeInTheDocument()
    expect(screen.getByText("150,000원 / 300,000원")).toBeInTheDocument()

    const bar = screen.getByRole("progressbar")
    expect(bar).toHaveAttribute("aria-valuenow", "50")
    expect(bar).toHaveAttribute("aria-valuemax", "100")
  })

  it("계획 0(ratio null)에 실지출이 있으면 —·초과 상태로 표시한다", () => {
    render(
      <BudgetUsageWidget
        budget={{ plannedTotal: 0, actualTotal: 30_000, ratio: null }}
      />,
    )

    expect(screen.getByText("—")).toBeInTheDocument()
    expect(screen.getByText("30,000원 / 0원")).toBeInTheDocument()
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100")
    expect(screen.getByTestId("budget-usage-bar")).toHaveClass("bg-expense-fg")
  })

  it("100% 초과 시 초과 상태로 표시한다 (바는 100%에서 캡)", () => {
    render(
      <BudgetUsageWidget
        budget={{ plannedTotal: 100_000, actualTotal: 130_000, ratio: 130 }}
      />,
    )

    expect(screen.getByText("130%")).toBeInTheDocument()
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100")
    expect(screen.getByTestId("budget-usage-bar")).toHaveClass("bg-expense-fg")
  })
})

describe("InvestmentWidget", () => {
  it("자산이 없으면 빈 상태와 자산 등록 링크를 보여준다", () => {
    render(<InvestmentWidget investment={null} />)

    expect(screen.getByText("투자 요약")).toBeInTheDocument()
    expect(screen.getByText("등록된 자산이 없습니다")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "자산 등록" })).toHaveAttribute(
      "href",
      "/assets",
    )
  })

  it("월 실현손익(부호 포함)·배당·평가액을 보여준다", () => {
    render(
      <InvestmentWidget
        investment={{
          totalValue: 1_700_000,
          invested: 500_000,
          sold: 297_000,
          dividend: 10_000,
          realizedGain: 47_000,
        }}
      />,
    )

    expect(screen.getByTestId("investment-realized-gain")).toHaveTextContent(
      "+47,000원",
    )
    expect(screen.getByText("배당 10,000원")).toBeInTheDocument()
    expect(screen.getByText("평가액 1,700,000원")).toBeInTheDocument()
  })

  it("실현손익이 음수면 부호 그대로 표시한다", () => {
    render(
      <InvestmentWidget
        investment={{
          totalValue: 0,
          invested: 0,
          sold: 0,
          dividend: 0,
          realizedGain: -12_000,
        }}
      />,
    )

    expect(screen.getByTestId("investment-realized-gain")).toHaveTextContent(
      "-12,000원",
    )
  })
})
