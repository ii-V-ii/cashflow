// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { RecurringDto } from "@/types/api"

const getRecurringListMock = vi.fn<() => Promise<RecurringDto[]>>()
const updateRecurringMock = vi.fn()
const deleteRecurringMock = vi.fn()
const createRecurringMock = vi.fn()

vi.mock("@/features/recurring/api", () => ({
  getRecurringList: () => getRecurringListMock(),
  createRecurring: (input: unknown) => createRecurringMock(input),
  updateRecurring: (id: string, input: unknown) => updateRecurringMock(id, input),
  deleteRecurring: (id: string) => deleteRecurringMock(id),
  processRecurring: vi.fn(),
}))

// 폼 의존 훅(계좌/카테고리)은 목록 테스트 범위 밖 — 빈 목록으로 고정
vi.mock("@/features/accounts/hooks/use-accounts", () => ({
  useAccounts: () => ({ data: [] }),
}))
vi.mock("@/features/categories/hooks/use-categories", () => ({
  useCategories: () => ({ data: [] }),
}))

import { RecurringTab } from "@/features/recurring/components/recurring-tab"

function makeRule(overrides: Partial<RecurringDto> = {}): RecurringDto {
  return {
    id: "r-1",
    type: "expense",
    amount: 15000,
    description: "OTT 구독",
    categoryId: null,
    accountId: "a-1",
    toAccountId: null,
    frequency: "monthly",
    interval: 1,
    startDate: "2026-08-01",
    endDate: null,
    nextDate: "2026-08-01",
    isActive: true,
    createdAt: "2026-07-10T00:00:00Z",
    updatedAt: "2026-07-10T00:00:00Z",
    ...overrides,
  }
}

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <RecurringTab />
    </QueryClientProvider>,
  )
}

describe("RecurringTab", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("규칙 목록을 주기·다음 발생일·금액과 함께 렌더링한다", async () => {
    getRecurringListMock.mockResolvedValue([
      makeRule(),
      makeRule({ id: "r-2", description: "월세", amount: 500000, interval: 2 }),
    ])

    renderTab()

    expect(await screen.findByText("OTT 구독")).toBeInTheDocument()
    expect(screen.getByText("월세")).toBeInTheDocument()
    expect(screen.getByText(/매월/)).toBeInTheDocument()
    expect(screen.getByText(/2개월마다/)).toBeInTheDocument()
    expect(screen.getAllByText(/2026-08-01|2026\. ?8\. ?1/).length).toBeGreaterThan(0)
  })

  it("빈 상태에서는 안내 문구와 등록 CTA를 보여준다", async () => {
    getRecurringListMock.mockResolvedValue([])

    renderTab()

    expect(
      await screen.findByText("등록된 정기 거래가 없습니다"),
    ).toBeInTheDocument()
    expect(screen.getByTestId("recurring-add-button")).toBeInTheDocument()
  })

  it("활성 토글을 누르면 isActive 반전으로 PATCH를 호출한다", async () => {
    getRecurringListMock.mockResolvedValue([makeRule()])
    updateRecurringMock.mockResolvedValue(makeRule({ isActive: false }))

    renderTab()
    fireEvent.click(await screen.findByTestId("recurring-toggle-r-1"))

    await waitFor(() =>
      expect(updateRecurringMock).toHaveBeenCalledWith("r-1", { isActive: false }),
    )
  })

  it("일시정지된 규칙은 '일시정지' 상태로 표시된다", async () => {
    getRecurringListMock.mockResolvedValue([makeRule({ isActive: false })])

    renderTab()

    expect(await screen.findByText("일시정지")).toBeInTheDocument()
  })

  it("목록 로드 실패 시 재시도 버튼을 보여준다", async () => {
    getRecurringListMock.mockRejectedValue(new Error("network"))

    renderTab()

    expect(
      await screen.findByText("정기 거래를 불러오지 못했습니다"),
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument()
  })
})
