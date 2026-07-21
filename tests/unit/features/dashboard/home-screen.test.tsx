// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"

import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { DashboardDto, TransactionDto } from "@/types/api"

/**
 * 홈 화면 — 캘린더 날짜 클릭 시 "최근 거래" 영역을 해당 날짜 거래로 치환 +
 * 카드 재배치(캘린더 → 최근 거래/선택 날짜 거래 → 예산·투자) (기능 2, 사용자 확정 스펙).
 */

const useDashboardMock = vi.fn()
vi.mock("@/features/dashboard/hooks/use-dashboard", () => ({
  useDashboard: (...args: unknown[]) => useDashboardMock(...args),
}))

const useTransactionsListMock = vi.fn()
vi.mock("@/features/transactions/hooks/use-transactions", () => ({
  useTransactionsList: (...args: unknown[]) => useTransactionsListMock(...args),
}))

import { HomeScreen } from "@/features/dashboard/components/home-screen"

function tx(overrides: Partial<TransactionDto>): TransactionDto {
  return {
    id: "t-default",
    type: "expense",
    amount: 1000,
    description: "기본거래",
    date: "2026-07-15",
    categoryId: null,
    category: null,
    accountId: "acc-a",
    account: { id: "acc-a", name: "은행", type: "bank" },
    toAccountId: null,
    toAccount: null,
    memo: null,
    tags: [],
    installmentMonths: null,
    installmentCurrent: null,
    status: "applied",
    recurringId: null,
    createdAt: "2026-07-15T00:00:00Z",
    updatedAt: "2026-07-15T00:00:00Z",
    ...overrides,
  }
}

function queryResult<T>(data: T | undefined, overrides: Record<string, unknown> = {}) {
  return {
    data,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    ...overrides,
  }
}

const DASHBOARD_DATA: DashboardDto = {
  netWorth: 550000,
  totalBalance: 550000,
  accountCount: 1,
  investment: null,
  monthlyIncome: 500000,
  monthlyExpense: 50000,
  dailyTotals: [{ date: "2026-07-03", income: 0, expense: 30000 }],
  budget: null,
  recentTransactions: [tx({ id: "recent-1", description: "최근거래1" })],
}

const DATE_TRANSACTIONS: TransactionDto[] = [
  tx({ id: "date-1", description: "선택일거래1", date: "2026-07-03" }),
]

beforeEach(() => {
  vi.clearAllMocks()
  useDashboardMock.mockReturnValue(queryResult(DASHBOARD_DATA))
  useTransactionsListMock.mockReturnValue(
    queryResult({ items: DATE_TRANSACTIONS, total: 1, page: 1, limit: 20 }),
  )
})

describe("HomeScreen — 캘린더 날짜 선택", () => {
  it("날짜 미선택 시 최근 거래를 렌더하고, 날짜별 거래 조회는 비활성 상태로 호출된다", () => {
    render(<HomeScreen />)

    expect(screen.getByText("최근거래1")).toBeInTheDocument()
    expect(screen.queryByText("선택일거래1")).not.toBeInTheDocument()
    expect(screen.getByText("최근 거래")).toBeInTheDocument()

    const lastCall = useTransactionsListMock.mock.calls.at(-1)
    expect(lastCall?.[3]).toBe(false) // enabled === false
  })

  it("날짜 선택 시 최근 거래가 해당 날짜 거래로 치환되고 해제 버튼이 노출된다", () => {
    render(<HomeScreen />)

    fireEvent.click(screen.getByRole("button", { name: "7월 3일 거래 보기" }))

    expect(screen.getByText("선택일거래1")).toBeInTheDocument()
    expect(screen.queryByText("최근거래1")).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "최근 거래로 돌아가기" }),
    ).toBeInTheDocument()

    const lastCall = useTransactionsListMock.mock.calls.at(-1)
    expect(lastCall?.[0]).toEqual({ from: "2026-07-03", to: "2026-07-03" })
    expect(lastCall?.[3]).toBe(true) // enabled === true
  })

  it("해제 버튼 클릭 시 최근 거래로 복귀한다", () => {
    render(<HomeScreen />)

    fireEvent.click(screen.getByRole("button", { name: "7월 3일 거래 보기" }))
    fireEvent.click(screen.getByRole("button", { name: "최근 거래로 돌아가기" }))

    expect(screen.getByText("최근거래1")).toBeInTheDocument()
    expect(screen.queryByText("선택일거래1")).not.toBeInTheDocument()
    expect(screen.getByText("최근 거래")).toBeInTheDocument()
  })

  it("월 변경 시 selectedDate가 초기화되어 최근 거래로 되돌아간다", () => {
    render(<HomeScreen />)

    fireEvent.click(screen.getByRole("button", { name: "7월 3일 거래 보기" }))
    expect(
      screen.getByRole("button", { name: "최근 거래로 돌아가기" }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "다음 달" }))

    expect(
      screen.queryByRole("button", { name: "최근 거래로 돌아가기" }),
    ).not.toBeInTheDocument()
    expect(screen.getByText("최근 거래")).toBeInTheDocument()
  })

  it("선택 날짜 거래가 없으면 날짜 맥락에 맞는 빈 상태 문구를 보여준다 (월 원장 카피 아님)", () => {
    useTransactionsListMock.mockReturnValue(
      queryResult({ items: [], total: 0, page: 1, limit: 20 }),
    )
    render(<HomeScreen />)

    fireEvent.click(screen.getByRole("button", { name: "7월 3일 거래 보기" }))

    expect(screen.getByText("이 날의 거래가 없습니다")).toBeInTheDocument()
    expect(screen.queryByText("이 달의 거래가 없습니다")).not.toBeInTheDocument()
  })

  it("선택 날짜 거래 조회 실패 시 에러 상태를 보여준다 (빈 목록으로 위장하지 않는다)", () => {
    useTransactionsListMock.mockReturnValue(
      queryResult(undefined, { isError: true }),
    )
    render(<HomeScreen />)

    fireEvent.click(screen.getByRole("button", { name: "7월 3일 거래 보기" }))

    expect(screen.getByText("거래를 불러오지 못했습니다")).toBeInTheDocument()
    expect(screen.queryByText("이 달의 거래가 없습니다")).not.toBeInTheDocument()
  })

  it("선택 날짜 거래가 페이지 한도(20건)를 초과하면 절단 사실을 명시하고 해당 월 목록 링크를 보여준다", () => {
    useTransactionsListMock.mockReturnValue(
      queryResult({ items: DATE_TRANSACTIONS, total: 25, page: 1, limit: 20 }),
    )
    render(<HomeScreen />)

    fireEvent.click(screen.getByRole("button", { name: "7월 3일 거래 보기" }))

    expect(screen.getByText("총 25건 중 1건 표시")).toBeInTheDocument()
    const monthLink = screen.getByRole("link", { name: /전체 보기|거래 목록/ })
    expect(monthLink).toHaveAttribute("href", "/transactions?ym=2026-07")
  })

  it("선택 날짜 거래가 페이지 한도 이내면 절단 안내를 보여주지 않는다", () => {
    useTransactionsListMock.mockReturnValue(
      queryResult({ items: DATE_TRANSACTIONS, total: 1, page: 1, limit: 20 }),
    )
    render(<HomeScreen />)

    fireEvent.click(screen.getByRole("button", { name: "7월 3일 거래 보기" }))

    expect(screen.queryByText(/건 중.*건 표시/)).not.toBeInTheDocument()
  })

  it("최근 거래/선택 날짜 거래 영역은 aria-live=polite로 콘텐츠 교체를 보조기기에 알린다 (MED-3)", () => {
    render(<HomeScreen />)

    expect(screen.getByTestId("transactions-section")).toHaveAttribute(
      "aria-live",
      "polite",
    )
  })

  it("렌더 순서는 캘린더 → 최근 거래(선택 날짜 거래) → 예산·투자 순이다", () => {
    const { container } = render(<HomeScreen />)

    const order = [...container.querySelectorAll("[data-testid$='-section']")].map(
      (el) => el.getAttribute("data-testid"),
    )

    expect(order).toEqual([
      "calendar-section",
      "transactions-section",
      "budget-investment-section",
    ])
  })
})
