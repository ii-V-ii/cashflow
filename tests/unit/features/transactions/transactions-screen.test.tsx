// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"

import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { TransactionDto } from "@/types/api"

/**
 * 101건+ 월 원장 버그 회귀 (설계도 5단계):
 * - 상단 요약은 useMonthlySettlement 값을 쓴다 (목록 items 클라이언트 합산 금지)
 * - 페이지네이션 nav는 비필터 기본 뷰에서도 노출된다
 * - "다음" 클릭으로 이동한 2페이지에서 월초 거래가 노출된다 (절단 없음)
 */

const replaceMock = vi.fn()
let searchParamsQuery = ""

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(searchParamsQuery),
}))

const useTransactionsMonthMock = vi.fn()
const useTransactionsListMock = vi.fn()
vi.mock("@/features/transactions/hooks/use-transactions", () => ({
  useTransactionsMonth: (...args: unknown[]) => useTransactionsMonthMock(...args),
  useTransactionsList: (...args: unknown[]) => useTransactionsListMock(...args),
}))

const useMonthlySettlementMock = vi.fn()
vi.mock("@/features/settlements/hooks/use-settlements", () => ({
  useMonthlySettlement: (...args: unknown[]) => useMonthlySettlementMock(...args),
}))

const mutation = { mutate: vi.fn(), isPending: false }
vi.mock("@/features/transactions/hooks/use-transaction-mutations", () => ({
  useUpdateTransaction: () => mutation,
  useDeleteTransaction: () => mutation,
}))

import { TransactionsScreen } from "@/features/transactions/components/transactions-screen"

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

beforeEach(() => {
  vi.clearAllMocks()
  searchParamsQuery = "ym=2026-07"
  useTransactionsListMock.mockReturnValue(queryResult(undefined))
})

describe("TransactionsScreen 상단 요약 — 월 결산 RPC 기반 (버그 회귀)", () => {
  it("목록 items 합계가 아니라 useMonthlySettlement 값을 그대로 표시한다", () => {
    // 목록에는 지출 1건(1,000원)뿐이지만, 결산 RPC는 실제 총합(101건 기준 큰 값)을 반환한다
    useTransactionsMonthMock.mockReturnValue(
      queryResult({ items: [tx({ amount: 1000 })], total: 101, page: 1, limit: 20 }),
    )
    useMonthlySettlementMock.mockReturnValue(
      queryResult({
        year: 2026,
        month: 7,
        income: { total: 500000, byCategory: [] },
        expense: {
          total: 1234500,
          byCategory: [],
          consumptionTotal: 1234500,
          savingTotal: 0,
        },
        net: -734500,
        accounts: [],
        momComparison: { incomeDiff: 0, expenseDiff: 0, netDiff: 0 },
      }),
    )

    render(<TransactionsScreen />)

    expect(screen.getByTestId("month-expense-total")).toHaveTextContent("1,234,500원")
    // 목록 items 합산값(1,000원)이 아니라는 사실을 명시적으로 확인
    expect(screen.getByTestId("month-expense-total")).not.toHaveTextContent("1,000원")
  })
})

describe("TransactionsScreen 페이지네이션 — 비필터 기본 뷰 (버그 회귀)", () => {
  it("비필터 상태에서도 total이 limit을 초과하면 페이지 nav가 노출된다", () => {
    useTransactionsMonthMock.mockReturnValue(
      queryResult({ items: [tx({})], total: 101, page: 1, limit: 20 }),
    )
    useMonthlySettlementMock.mockReturnValue(queryResult(undefined, { isPending: true }))

    render(<TransactionsScreen />)

    expect(screen.getByRole("navigation", { name: "페이지" })).toBeInTheDocument()
  })

  it("'다음' 클릭 시 page 파라미터가 증가한 URL로 이동한다", () => {
    useTransactionsMonthMock.mockReturnValue(
      queryResult({ items: [tx({})], total: 101, page: 1, limit: 20 }),
    )
    useMonthlySettlementMock.mockReturnValue(queryResult(undefined, { isPending: true }))

    render(<TransactionsScreen />)
    fireEvent.click(screen.getByRole("button", { name: "다음" }))

    expect(replaceMock).toHaveBeenCalledWith(
      expect.stringContaining("page=2"),
    )
  })

  it("2페이지 조회 결과에는 절단되었던 월초 거래가 포함된다", () => {
    searchParamsQuery = "ym=2026-07&page=2"
    const earlyMonthTx = tx({
      id: "t-early",
      description: "월초거래",
      date: "2026-07-01",
    })
    useTransactionsMonthMock.mockReturnValue(
      queryResult({ items: [earlyMonthTx], total: 101, page: 2, limit: 20 }),
    )
    useMonthlySettlementMock.mockReturnValue(queryResult(undefined, { isPending: true }))

    render(<TransactionsScreen />)

    expect(screen.getByText("월초거래")).toBeInTheDocument()
    // 화면이 URL의 page=2를 그대로 훅에 전달했는지 확인 (설계도: useTransactionsMonth(ym, page, ...))
    expect(useTransactionsMonthMock).toHaveBeenCalledWith("2026-07", 2, true)
  })
})

describe("TransactionsScreen 페이지 범위 클램프 (LOW-7)", () => {
  it("현재 page가 조회 결과의 마지막 유효 페이지를 넘으면 마지막 페이지로 클램프한다", () => {
    // 마지막 페이지(3)의 마지막 항목을 삭제한 뒤 남은 상황: total=20, limit=20 → 유효 페이지는 1뿐
    searchParamsQuery = "ym=2026-07&page=3"
    useTransactionsMonthMock.mockReturnValue(
      queryResult({ items: [], total: 20, page: 3, limit: 20 }),
    )
    useMonthlySettlementMock.mockReturnValue(queryResult(undefined, { isPending: true }))

    render(<TransactionsScreen />)

    expect(replaceMock).toHaveBeenCalledWith("/transactions?ym=2026-07")
  })

  it("page가 유효 범위 내면 클램프하지 않는다 (불필요한 navigate 금지)", () => {
    searchParamsQuery = "ym=2026-07&page=2"
    useTransactionsMonthMock.mockReturnValue(
      queryResult({ items: [tx({})], total: 101, page: 2, limit: 20 }),
    )
    useMonthlySettlementMock.mockReturnValue(queryResult(undefined, { isPending: true }))

    render(<TransactionsScreen />)

    expect(replaceMock).not.toHaveBeenCalled()
  })
})
