// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { getSavingsMaturityInfo } from "@/lib/calculations/deposit-maturity"
import type { AccountDto } from "@/types/api"

const useAccountsMock = vi.fn()
const mutation = { mutate: vi.fn(), isPending: false }

vi.mock("@/features/accounts/hooks/use-accounts", () => ({
  useAccounts: () => useAccountsMock(),
  useAccountMutations: () => ({ create: mutation, update: mutation, remove: mutation }),
  useReorderAccounts: () => ({ mutate: vi.fn() }),
}))

import { AccountsScreen } from "@/features/accounts/components/accounts-screen"

function account(overrides: Partial<AccountDto>): AccountDto {
  return {
    id: "a1",
    name: "테스트계좌",
    type: "bank",
    balance: 0,
    initialBalance: 0,
    color: null,
    icon: null,
    sortOrder: 0,
    isActive: true,
    depositType: null,
    termMonths: null,
    interestRate: null,
    taxType: null,
    openDate: null,
    monthlyPayment: null,
    billingDay: null,
    creditLimit: null,
    linkedAccountId: null,
    assetId: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

/** 미래 개설일 기반 — 실행 시점과 무관하게 만기 미도래 유지 */
const SAVINGS = account({
  id: "s1",
  name: "청년적금",
  type: "savings",
  balance: 1_200_000,
  depositType: "installment",
  termMonths: 24,
  interestRate: 4.5,
  taxType: "tax_free",
  openDate: "2026-01-15",
  monthlyPayment: 200_000,
})

describe("AccountsScreen 적금 만기 배지 (PRD §3.9, UI.md 계좌/카드)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("만기 정보가 있는 적금 → D-day 배지 + 예상 이자", () => {
    useAccountsMock.mockReturnValue({ data: [SAVINGS], isPending: false })
    render(<AccountsScreen />)

    const badge = screen.getByTestId("maturity-badge-청년적금")
    const today = new Date()
    const todayYmd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
    const info = getSavingsMaturityInfo(SAVINGS, todayYmd)

    expect(badge).toHaveTextContent(info!.dDay >= 0 ? `D-${info!.dDay}` : "만기")
    // 세후 예상 이자 225,000원 (tax_free 적립식)
    expect(screen.getByTestId("maturity-interest-청년적금")).toHaveTextContent(
      "225,000원",
    )
  })

  it("만기 정보가 불완전한 적금 → 배지 없음", () => {
    useAccountsMock.mockReturnValue({
      data: [account({ ...SAVINGS, openDate: null })],
      isPending: false,
    })
    render(<AccountsScreen />)

    expect(screen.queryByTestId("maturity-badge-청년적금")).not.toBeInTheDocument()
  })

  it("일반 은행 계좌 → 배지 없음", () => {
    useAccountsMock.mockReturnValue({
      data: [account({ name: "국민은행" })],
      isPending: false,
    })
    render(<AccountsScreen />)

    expect(screen.queryByTestId("maturity-badge-국민은행")).not.toBeInTheDocument()
  })
})
