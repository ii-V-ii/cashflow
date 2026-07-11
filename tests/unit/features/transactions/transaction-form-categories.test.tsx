// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { AccountDto, CategoryDto, TransactionDto } from "@/types/api"

vi.mock("@/features/accounts/hooks/use-accounts", () => ({
  useAccounts: () => ({
    data: [
      {
        id: "a1",
        name: "은행",
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
      } satisfies AccountDto,
    ],
  }),
}))

function category(overrides: Partial<CategoryDto>): CategoryDto {
  return {
    id: "c0",
    name: "카테고리",
    type: "expense",
    expenseKind: "consumption",
    icon: null,
    color: null,
    parentId: null,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

// API가 sort_order 평면 정렬로 돌려주는 상황(부모/자식 뒤섞임)을 재현
const CATEGORIES: CategoryDto[] = [
  category({ id: "c-delivery", name: "배달", parentId: "p-food", sortOrder: 0 }),
  category({ id: "p-transport", name: "교통", sortOrder: 1 }),
  category({ id: "c-out", name: "외식", parentId: "p-food", sortOrder: 1 }),
  category({ id: "p-food", name: "식비", sortOrder: 0 }),
]

vi.mock("@/features/categories/hooks/use-categories", () => ({
  useCategories: () => ({ data: CATEGORIES }),
}))

import { TransactionForm } from "@/features/transactions/components/transaction-form"

function transaction(overrides: Partial<TransactionDto>): TransactionDto {
  return {
    id: "t1",
    type: "expense",
    amount: 12000,
    description: "외식",
    date: "2026-07-01",
    categoryId: null,
    category: null,
    accountId: "a1",
    account: { id: "a1", name: "은행", type: "bank" },
    toAccountId: null,
    toAccount: null,
    memo: null,
    tags: [],
    installmentMonths: null,
    installmentCurrent: null,
    status: "applied",
    recurringId: null,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    ...overrides,
  }
}

describe("TransactionForm 카테고리 칩", () => {
  it("신규 입력: 대분류 칩만 sortOrder 순으로 노출한다", () => {
    render(
      <TransactionForm isPending={false} submitLabel="저장" onSubmit={vi.fn()} />,
    )

    const listbox = screen.getByRole("listbox", { name: "카테고리" })
    const options = within(listbox).getAllByRole("option")
    expect(options.map((option) => option.textContent)).toEqual(["식비", "교통"])
    expect(screen.queryByTestId("category-child-row")).not.toBeInTheDocument()
  })

  it("수정 모드: 소분류가 선택된 거래를 열면 부모가 펼쳐지고 소분류가 선택돼 있다", () => {
    render(
      <TransactionForm
        initial={transaction({ categoryId: "c-out" })}
        isPending={false}
        submitLabel="수정 저장"
        onSubmit={vi.fn()}
      />,
    )

    expect(screen.getByTestId("category-child-row")).toBeInTheDocument()
    expect(screen.getByTestId("category-chip-외식")).toHaveAttribute("aria-selected", "true")
    expect(screen.getByTestId("category-chip-식비")).toHaveAttribute("aria-expanded", "true")
  })
})
