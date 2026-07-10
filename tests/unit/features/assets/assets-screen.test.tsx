// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AssetsScreen } from "@/features/assets/components/assets-screen"
import type { AssetDto, PortfolioDto } from "@/types/api"

const getAssetsMock = vi.fn<() => Promise<AssetDto[]>>()
const getPortfolioMock = vi.fn<() => Promise<PortfolioDto>>()
const getAssetCategoriesMock = vi.fn(async () => [])

vi.mock("@/features/assets/api", () => ({
  getAssets: (...args: unknown[]) => getAssetsMock(...(args as [])),
  getPortfolio: () => getPortfolioMock(),
  getAssetCategories: () => getAssetCategoriesMock(),
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

// Recharts lazy 차트는 jsdom에서 렌더하지 않는다
vi.mock("next/dynamic", () => ({
  default: () => () => null,
}))

function makeAsset(overrides: Partial<AssetDto> = {}): AssetDto {
  return {
    id: "asset-1",
    name: "해외주식",
    assetCategoryId: "cat-1",
    assetCategory: { id: "cat-1", name: "주식", kind: "financial", icon: null, color: null },
    acquisitionDate: "2026-01-01",
    acquisitionCost: 1_000_000,
    currentValue: 1_250_000,
    gain: 250_000,
    gainRate: 25,
    institution: null,
    memo: null,
    isActive: true,
    metadata: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AssetsScreen />
    </QueryClientProvider>,
  )
}

describe("AssetsScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPortfolioMock.mockResolvedValue({ total: 0, byCategory: [] })
    getAssetCategoriesMock.mockResolvedValue([])
  })

  it("빈 상태: 안내 문구와 자산 만들기 CTA를 보여준다", async () => {
    getAssetsMock.mockResolvedValue([])
    renderScreen()

    await waitFor(() =>
      expect(screen.getByText("자산이 없습니다")).toBeInTheDocument(),
    )
    expect(screen.getByRole("button", { name: "자산 만들기" })).toBeInTheDocument()
  })

  it("자산 목록: 현재가치·평가손익(±%)·카테고리 배지를 표시한다", async () => {
    getAssetsMock.mockResolvedValue([makeAsset()])
    renderScreen()

    await waitFor(() =>
      expect(screen.getByText("해외주식")).toBeInTheDocument(),
    )
    expect(screen.getAllByText("1,250,000원")).toHaveLength(2) // 총 자산 + 행
    expect(screen.getByText("+250,000원 (25%)")).toBeInTheDocument()
    expect(screen.getByText("주식")).toBeInTheDocument()
    expect(screen.getByTestId("total-asset-value")).toHaveTextContent("1,250,000원")
  })

  it("자산 행은 상세 페이지로 링크된다", async () => {
    getAssetsMock.mockResolvedValue([makeAsset()])
    renderScreen()

    await waitFor(() => expect(screen.getByTestId("asset-row")).toBeInTheDocument())
    expect(screen.getByRole("link", { name: /해외주식/ })).toHaveAttribute(
      "href",
      "/assets/asset-1",
    )
  })
})
