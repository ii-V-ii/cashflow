// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ForecastResultDto, ForecastScenarioDto } from "@/types/api"

const useForecastScenariosMock = vi.fn()
const useForecastResultsMock = vi.fn()
const createMutate = vi.fn()
const removeMutate = vi.fn()
const runMutate = vi.fn()

vi.mock("@/features/forecast/hooks/use-forecast", () => ({
  useForecastScenarios: () => useForecastScenariosMock(),
  useForecastResults: (id: string | null) => useForecastResultsMock(id),
  useForecastMutations: () => ({
    create: { mutate: createMutate, isPending: false },
    remove: { mutate: removeMutate, isPending: false },
    run: { mutate: runMutate, isPending: false },
  }),
}))

// recharts 렌더링은 차트 모듈 테스트 범위 밖 — 스텁으로 대체
vi.mock("@/features/forecast/components/forecast-charts", () => ({
  default: ({ goalYm }: { goalYm: string | null }) => (
    <div data-testid="forecast-charts" data-goal-ym={goalYm ?? ""} />
  ),
}))

import { ForecastScreen } from "@/features/forecast/components/forecast-screen"

const SCENARIOS: ForecastScenarioDto[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "기본 시나리오",
    description: null,
    assumptions: { incomeGrowthRate: 3 },
    startDate: "2026-07-01",
    endDate: "2027-06-30",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "보수적",
    description: "지출 증가 가정",
    assumptions: null,
    startDate: "2026-07-01",
    endDate: "2027-06-30",
  },
]

const RESULTS: ForecastResultDto[] = [
  {
    ym: "2026-07",
    projectedIncome: 3_000_000,
    projectedExpense: 1_000_000,
    projectedCashflow: 4_100_000,
    projectedNetWorth: 4_100_000,
    goalProgress: null,
  },
  {
    ym: "2026-08",
    projectedIncome: 3_000_000,
    projectedExpense: 1_000_000,
    projectedCashflow: 6_100_000,
    projectedNetWorth: 6_100_000,
    goalProgress: null,
  },
]

describe("ForecastScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useForecastScenariosMock.mockReturnValue({ data: SCENARIOS, isPending: false })
    useForecastResultsMock.mockReturnValue({ data: RESULTS, isPending: false })
  })

  it("빈 상태 — 안내 + 새 시나리오 CTA (PRD §3.9)", () => {
    useForecastScenariosMock.mockReturnValue({ data: [], isPending: false })
    useForecastResultsMock.mockReturnValue({ data: [], isPending: false })
    render(<ForecastScreen />)

    expect(screen.getByText("등록된 시나리오가 없습니다")).toBeInTheDocument()
    fireEvent.click(screen.getByTestId("add-scenario-cta"))
    expect(screen.getByText("새 시나리오")).toBeInTheDocument()
  })

  it("시나리오 카드 목록을 렌더링하고 첫 카드가 기본 선택된다", () => {
    render(<ForecastScreen />)

    const cards = screen.getAllByTestId("scenario-card")
    expect(cards).toHaveLength(2)
    expect(cards[0]).toHaveTextContent("기본 시나리오")
    expect(cards[0]).toHaveAttribute("aria-pressed", "true")
    // 첫 시나리오의 결과를 조회한다
    expect(useForecastResultsMock).toHaveBeenCalledWith(SCENARIOS[0].id)
  })

  it("실행 버튼 → run.mutate(선택 시나리오 id)", () => {
    render(<ForecastScreen />)

    fireEvent.click(screen.getByTestId("run-forecast"))
    expect(runMutate).toHaveBeenCalledWith(SCENARIOS[0].id)
  })

  it("결과가 있으면 차트가 lazy 렌더링된다", async () => {
    render(<ForecastScreen />)

    await waitFor(() =>
      expect(screen.getByTestId("forecast-charts")).toBeInTheDocument(),
    )
  })

  it("목표 금액 입력 → 도달 시점이 차트에 전달된다 (findGoalReachYm)", async () => {
    render(<ForecastScreen />)

    fireEvent.change(screen.getByTestId("goal-input"), {
      target: { value: "6000000" },
    })

    await waitFor(() =>
      expect(screen.getByTestId("forecast-charts")).toHaveAttribute(
        "data-goal-ym",
        "2026-08",
      ),
    )
  })

  it("결과가 없으면 실행 유도 안내를 보여준다", () => {
    useForecastResultsMock.mockReturnValue({ data: [], isPending: false })
    render(<ForecastScreen />)

    expect(screen.getByText(/예측을 실행/)).toBeInTheDocument()
  })

  it("삭제 버튼 → 확인 다이얼로그 → remove.mutate", () => {
    render(<ForecastScreen />)

    fireEvent.click(screen.getByLabelText("보수적 삭제"))
    expect(screen.getByText("시나리오를 삭제할까요?")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "삭제" }))
    expect(removeMutate).toHaveBeenCalledWith(SCENARIOS[1].id, expect.anything())
  })

  it("생성 폼 저장 → create.mutate", () => {
    render(<ForecastScreen />)

    fireEvent.click(screen.getByTestId("add-scenario"))
    fireEvent.change(screen.getByTestId("scenario-name-input"), {
      target: { value: "새해 계획" },
    })
    fireEvent.click(screen.getByTestId("save-scenario"))

    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "새해 계획" }),
      expect.anything(),
    )
  })
})
