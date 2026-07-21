// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"

import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { TransactionList } from "@/features/transactions/components/transaction-list"
import type { TransactionDto } from "@/types/api"

/**
 * 빈 상태 문구 — 기본값은 "월 원장" 맥락(기존 유일 호출부: transactions-screen.tsx),
 * 홈 화면의 "선택 날짜 거래" 같은 다른 맥락에서는 emptyMessage로 오버라이드한다
 * (HIGH-A: 리뷰 반영 — 잘못된 카피를 홈에 마크업 복제 없이 재사용).
 */
describe("TransactionList — 빈 상태 문구", () => {
  it("emptyMessage 미지정 시 기존 문구를 그대로 보여준다 (기본값 회귀 방지)", () => {
    render(<TransactionList items={[]} onSelect={vi.fn()} />)

    expect(screen.getByText("이 달의 거래가 없습니다")).toBeInTheDocument()
  })

  it("emptyMessage 지정 시 해당 문구로 대체된다", () => {
    render(
      <TransactionList items={[]} onSelect={vi.fn()} emptyMessage="이 날의 거래가 없습니다" />,
    )

    expect(screen.getByText("이 날의 거래가 없습니다")).toBeInTheDocument()
    expect(screen.queryByText("이 달의 거래가 없습니다")).not.toBeInTheDocument()
  })

  it("items가 있으면 emptyMessage와 무관하게 목록을 렌더한다", () => {
    const items: TransactionDto[] = [
      {
        id: "t-1",
        type: "expense",
        amount: 1000,
        description: "테스트거래",
        date: "2026-07-03",
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
        createdAt: "2026-07-03T00:00:00Z",
        updatedAt: "2026-07-03T00:00:00Z",
      },
    ]

    render(
      <TransactionList items={items} onSelect={vi.fn()} emptyMessage="이 날의 거래가 없습니다" />,
    )

    expect(screen.getByText("테스트거래")).toBeInTheDocument()
    expect(screen.queryByText("이 날의 거래가 없습니다")).not.toBeInTheDocument()
  })
})
