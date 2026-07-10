// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { InvestmentsScreen } from "@/features/investments/components/investments-screen"
import type { AssetDto, PageDto, TradeDto } from "@/types/api"

const getAssetsMock = vi.fn<() => Promise<AssetDto[]>>()
const getTradesMock = vi.fn<() => Promise<PageDto<TradeDto>>>()

vi.mock("@/features/assets/api", () => ({
  getAssets: () => getAssetsMock(),
  getPortfolio: vi.fn(async () => ({ total: 0, byCategory: [] })),
  getAssetCategories: vi.fn(async () => []),
  getAssetDetail: vi.fn(),
  createAsset: vi.fn(),
  updateAsset: vi.fn(),
  deleteAsset: vi.fn(),
  getValuations: vi.fn(),
  createValuation: vi.fn(),
  createAssetCategory: vi.fn(),
  updateAssetCategory: vi.fn(),
  deleteAssetCategory: vi.fn(),
}))

vi.mock("@/features/investments/api", () => ({
  getTrades: (...args: unknown[]) => getTradesMock(...(args as [])),
  createTrade: vi.fn(),
  updateTradeMemo: vi.fn(),
  deleteTrade: vi.fn(),
  getTradeSummary: vi.fn(async () => ({
    totalBuy: 10_000,
    totalSell: 8_000,
    realizedGain: 3_000,
    dividendIncome: 500,
    feeTotal: 0,
    taxTotal: 0,
    netProfit: 3_500,
    returnRate: 35,
  })),
  getTickerBreakdown: vi.fn(async () => ({ holding: [], closed: [] })),
  getAnnualSummary: vi.fn(async () => ({
    months: [],
    total: { investedAmount: 0, dividendIncome: 0, realizedGain: 0, returnRate: 0 },
  })),
}))

function makeAsset(): AssetDto {
  return {
    id: "asset-1",
    name: "해외주식",
    assetCategoryId: "cat-1",
    assetCategory: { id: "cat-1", name: "주식", kind: "financial", icon: null, color: null },
    acquisitionDate: "2026-01-01",
    acquisitionCost: 0,
    currentValue: 0,
    gain: 0,
    gainRate: 0,
    institution: null,
    memo: null,
    isActive: true,
    metadata: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }
}

function makeTrade(overrides: Partial<TradeDto> = {}): TradeDto {
  return {
    id: "trade-1",
    assetId: "asset-1",
    asset: { id: "asset-1", name: "해외주식" },
    tradeType: "sell",
    date: "2026-02-01",
    ticker: "AAPL",
    quantity: 5,
    unitPrice: 0,
    totalAmount: 8_000,
    fee: 0,
    tax: 0,
    netAmount: 8_000,
    remainingQuantity: null,
    realizedGain: 3_000,
    memo: null,
    accountId: null,
    createdAt: "2026-02-01T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
    ...overrides,
  }
}

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <InvestmentsScreen />
    </QueryClientProvider>,
  )
}

describe("InvestmentsScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("자산이 없으면 자산 연결 안내 빈 상태를 보여준다", async () => {
    getAssetsMock.mockResolvedValue([])
    getTradesMock.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 })
    renderScreen()

    await waitFor(() =>
      expect(
        screen.getByText("투자 기록에 연결할 자산이 없습니다"),
      ).toBeInTheDocument(),
    )
    expect(screen.getByRole("link", { name: "자산 만들러 가기" })).toHaveAttribute(
      "href",
      "/assets",
    )
    expect(screen.getByTestId("add-trade")).toBeDisabled()
  })

  it("매매 기록이 없으면 등록 CTA 빈 상태를 보여준다", async () => {
    getAssetsMock.mockResolvedValue([makeAsset()])
    getTradesMock.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 })
    renderScreen()

    await waitFor(() =>
      expect(screen.getByText("매매 기록이 없습니다")).toBeInTheDocument(),
    )
    expect(screen.getByRole("button", { name: "첫 매매 등록하기" })).toBeInTheDocument()
  })

  it("매도 기록 행: 유형 배지·실현손익을 표시한다", async () => {
    getAssetsMock.mockResolvedValue([makeAsset()])
    getTradesMock.mockResolvedValue({
      items: [makeTrade()],
      total: 1,
      page: 1,
      limit: 20,
    })
    renderScreen()

    await waitFor(() => expect(screen.getByTestId("trade-row")).toBeInTheDocument())
    expect(screen.getByText("매도")).toBeInTheDocument()
    expect(screen.getByText("실현 +3,000원")).toBeInTheDocument()
  })

  it("수익 요약 탭으로 전환하면 합계가 표시된다", async () => {
    getAssetsMock.mockResolvedValue([makeAsset()])
    getTradesMock.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 })
    renderScreen()

    fireEvent.click(screen.getByTestId("investments-tab-summary"))

    await waitFor(() =>
      expect(screen.getByTestId("summary-net-profit")).toHaveTextContent("+3,500원"),
    )
    expect(screen.getByText("수익률 35%")).toBeInTheDocument()
  })
})
