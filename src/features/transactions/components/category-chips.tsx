"use client"

import { ChevronDownIcon } from "lucide-react"
import { useMemo } from "react"

import { cn } from "@/lib/utils"
import type { CategoryDto } from "@/types/api"

export interface CategoryChipGroup {
  parent: CategoryDto
  children: CategoryDto[]
}

function compareCategories(a: CategoryDto, b: CategoryDto): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ko")
}

/**
 * 평면 카테고리 목록 → 대분류(sortOrder→이름 정렬) + 부모별 소분류 그룹.
 * 부모가 목록에 없는 소분류는 대분류로 승격해 유실을 막는다.
 */
export function buildCategoryChipGroups(
  categories: CategoryDto[],
): CategoryChipGroup[] {
  const ids = new Set(categories.map((category) => category.id))
  const isTopLevel = (category: CategoryDto) =>
    category.parentId === null || !ids.has(category.parentId)

  return categories
    .filter(isTopLevel)
    .sort(compareCategories)
    .map((parent) => ({
      parent,
      children: categories
        .filter((category) => category.parentId === parent.id)
        .sort(compareCategories),
    }))
}

interface CategoryChipsProps {
  categories: CategoryDto[]
  selectedId: string | null
  type: "income" | "expense" | "transfer"
  onSelect: (categoryId: string | null) => void
}

function activeChipClass(
  category: CategoryDto,
  type: CategoryChipsProps["type"],
): string {
  if (category.expenseKind === "saving") {
    return "border-saving bg-saving-subtle text-saving-fg"
  }
  return type === "income"
    ? "border-income bg-income-subtle text-income-fg"
    : "border-expense bg-expense-subtle text-expense-fg"
}

const CHIP_BASE_CLASS =
  "flex h-11 shrink-0 items-center gap-1 rounded-full border border-hairline px-4 text-sm font-medium text-ink-muted transition-colors"

/**
 * 카테고리 선택 칩 (UI.md §4.2) — 1행은 대분류만, 소분류가 있는 대분류를
 * 선택하면 아래에 소분류 행이 확장된다. 대분류 자체도 선택 가능(소분류 미선택 저장).
 * 확장 상태는 선택값에서 파생 — 수정 모드 프리셀렉트가 자동으로 동작한다.
 */
export function CategoryChips({
  categories,
  selectedId,
  type,
  onSelect,
}: CategoryChipsProps) {
  const groups = useMemo(() => buildCategoryChipGroups(categories), [categories])

  const selected = categories.find((category) => category.id === selectedId)
  const expandedParentId = selected ? (selected.parentId ?? selected.id) : null
  const expandedGroup = groups.find(
    (group) => group.parent.id === expandedParentId && group.children.length > 0,
  )

  if (groups.length === 0) return null

  return (
    <div role="listbox" aria-label="카테고리" className="flex flex-col gap-1.5">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {groups.map(({ parent, children }) => {
          const isSelected = selectedId === parent.id
          const isExpanded = expandedGroup?.parent.id === parent.id
          return (
            <button
              key={parent.id}
              type="button"
              role="option"
              aria-selected={isSelected}
              aria-expanded={children.length > 0 ? isExpanded : undefined}
              onClick={() => onSelect(isSelected ? null : parent.id)}
              data-testid={`category-chip-${parent.name}`}
              className={cn(
                CHIP_BASE_CLASS,
                isSelected && activeChipClass(parent, type),
                // 소분류가 선택된 부모: 펼침 맥락만 표시 (선택 아님)
                !isSelected && isExpanded && "border-ink bg-surface-sunken text-ink",
              )}
            >
              {parent.name}
              {children.length > 0 && (
                <ChevronDownIcon
                  aria-hidden
                  className={cn("size-3.5 transition-transform", isExpanded && "rotate-180")}
                />
              )}
            </button>
          )
        })}
      </div>

      {expandedGroup && (
        <div
          data-testid="category-child-row"
          className="flex gap-1.5 overflow-x-auto pb-1 pl-1 animate-in fade-in slide-in-from-top-1 duration-150"
        >
          {expandedGroup.children.map((child) => {
            const isSelected = selectedId === child.id
            return (
              <button
                key={child.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() =>
                  onSelect(isSelected ? expandedGroup.parent.id : child.id)
                }
                data-testid={`category-chip-${child.name}`}
                className={cn(CHIP_BASE_CLASS, isSelected && activeChipClass(child, type))}
              >
                {child.name}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
