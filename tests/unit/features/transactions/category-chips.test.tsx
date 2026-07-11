// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it } from "vitest"

import {
  buildCategoryChipGroups,
  CategoryChips,
} from "@/features/transactions/components/category-chips"
import type { CategoryDto } from "@/types/api"

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

/**
 * 입력 순서를 일부러 뒤섞어 정렬을 검증한다.
 * 대분류: 식비(0) → 교통(1) → 생활(1, 이름 후순위) → 문화(2, 소분류 없음)
 * 식비의 소분류: 배달(0) → 외식(1)
 */
const CATEGORIES: CategoryDto[] = [
  category({ id: "c-out", name: "외식", parentId: "p-food", sortOrder: 1 }),
  category({ id: "p-life", name: "생활", sortOrder: 1 }),
  category({ id: "p-culture", name: "문화", sortOrder: 2 }),
  category({ id: "p-food", name: "식비", sortOrder: 0 }),
  category({ id: "c-delivery", name: "배달", parentId: "p-food", sortOrder: 0 }),
  category({ id: "p-transport", name: "교통", sortOrder: 1 }),
]

function Harness({ initial = null }: { initial?: string | null }) {
  const [selected, setSelected] = useState<string | null>(initial)
  return (
    <CategoryChips
      categories={CATEGORIES}
      selectedId={selected}
      type="expense"
      onSelect={setSelected}
    />
  )
}

describe("buildCategoryChipGroups", () => {
  it("대분류를 sortOrder → 이름 순으로 정렬하고 소분류를 부모 아래에 묶는다", () => {
    const groups = buildCategoryChipGroups(CATEGORIES)

    expect(groups.map((group) => group.parent.name)).toEqual([
      "식비",
      "교통",
      "생활",
      "문화",
    ])
    expect(groups[0].children.map((child) => child.name)).toEqual(["배달", "외식"])
    expect(groups[1].children).toEqual([])
  })

  it("부모가 목록에 없는 소분류는 대분류로 승격해 유실하지 않는다", () => {
    const orphan = category({ id: "c-orphan", name: "고아", parentId: "p-none", sortOrder: 9 })
    const groups = buildCategoryChipGroups([orphan, category({ id: "p-food", name: "식비" })])

    expect(groups.map((group) => group.parent.name)).toEqual(["식비", "고아"])
  })
})

describe("CategoryChips", () => {
  it("첫 행에는 대분류 칩만 정렬 순서대로 노출한다", () => {
    render(<Harness />)

    const options = screen.getAllByRole("option")
    expect(options.map((option) => option.textContent)).toEqual([
      "식비",
      "교통",
      "생활",
      "문화",
    ])
    expect(screen.queryByText("배달")).not.toBeInTheDocument()
    expect(screen.queryByTestId("category-child-row")).not.toBeInTheDocument()
  })

  it("소분류가 있는 대분류를 탭하면 선택되면서 소분류 행이 나타난다", () => {
    render(<Harness />)

    fireEvent.click(screen.getByTestId("category-chip-식비"))

    expect(screen.getByTestId("category-chip-식비")).toHaveAttribute("aria-selected", "true")
    const childRow = screen.getByTestId("category-child-row")
    expect(childRow).toBeInTheDocument()
    expect(
      [...childRow.querySelectorAll("[role='option']")].map((chip) => chip.textContent),
    ).toEqual(["배달", "외식"])
  })

  it("소분류를 탭하면 소분류가 선택되고 부모 행은 유지된다", () => {
    render(<Harness />)

    fireEvent.click(screen.getByTestId("category-chip-식비"))
    fireEvent.click(screen.getByTestId("category-chip-외식"))

    expect(screen.getByTestId("category-chip-외식")).toHaveAttribute("aria-selected", "true")
    expect(screen.getByTestId("category-chip-식비")).toHaveAttribute("aria-selected", "false")
    expect(screen.getByTestId("category-child-row")).toBeInTheDocument()
  })

  it("소분류가 없는 대분류는 즉시 선택되고 소분류 행이 생기지 않는다", () => {
    render(<Harness />)

    fireEvent.click(screen.getByTestId("category-chip-문화"))

    expect(screen.getByTestId("category-chip-문화")).toHaveAttribute("aria-selected", "true")
    expect(screen.queryByTestId("category-child-row")).not.toBeInTheDocument()
  })

  it("선택된 대분류를 다시 탭하면 선택 해제되고 소분류 행이 접힌다", () => {
    render(<Harness />)

    fireEvent.click(screen.getByTestId("category-chip-식비"))
    fireEvent.click(screen.getByTestId("category-chip-식비"))

    expect(screen.getByTestId("category-chip-식비")).toHaveAttribute("aria-selected", "false")
    expect(screen.queryByTestId("category-child-row")).not.toBeInTheDocument()
  })

  it("수정 모드: 소분류가 선택된 상태로 열면 부모가 펼쳐지고 소분류가 선택 표시된다", () => {
    render(<Harness initial="c-out" />)

    expect(screen.getByTestId("category-child-row")).toBeInTheDocument()
    expect(screen.getByTestId("category-chip-외식")).toHaveAttribute("aria-selected", "true")
    expect(screen.getByTestId("category-chip-식비")).toHaveAttribute("data-expanded", "true")
  })
})
