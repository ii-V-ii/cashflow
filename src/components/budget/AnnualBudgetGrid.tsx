"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { useAnnualGrid, useUpdateGridCell } from "@/hooks/use-budget"
import type { AnnualGridGroup, AnnualGridCategory } from "@/types"

/** Grid-compact format: comma-separated number without ₩ symbol */
function formatCompact(value: number): string {
  return value.toLocaleString("ko-KR")
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)
const MONTH_LABELS = [
  "1월", "2월", "3월", "4월", "5월", "6월",
  "7월", "8월", "9월", "10월", "11월", "12월",
]

interface AnnualBudgetGridProps {
  year: number
  type: "income" | "expense"
}

export function AnnualBudgetGrid({ year, type }: AnnualBudgetGridProps) {
  const { data, isLoading } = useAnnualGrid(year, type)
  const updateCell = useUpdateGridCell()

  const [editingCell, setEditingCell] = useState<{
    categoryId: string
    month: number
  } | null>(null)
  const [editValue, setEditValue] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingCell])

  const handleCellClick = useCallback(
    (categoryId: string, month: number, currentValue: number) => {
      setEditingCell({ categoryId, month })
      setEditValue(currentValue > 0 ? String(currentValue) : "")
    },
    [],
  )

  const findCurrentAmount = useCallback(
    (categoryId: string, month: number): number => {
      if (!data) return 0
      for (const group of data.groups) {
        const cat = group.categories.find((c) => c.id === categoryId)
        if (cat) return cat.months[month] ?? 0
      }
      return 0
    },
    [data],
  )

  const commitEdit = useCallback(() => {
    if (!editingCell) return
    const newAmount = Math.max(0, parseInt(editValue, 10) || 0)
    const currentAmount = findCurrentAmount(
      editingCell.categoryId,
      editingCell.month,
    )

    if (newAmount !== currentAmount) {
      updateCell.mutate({
        year,
        month: editingCell.month,
        categoryId: editingCell.categoryId,
        amount: newAmount,
        type,
      })
    }
    setEditingCell(null)
  }, [editingCell, editValue, findCurrentAmount, year, type, updateCell])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault()
        commitEdit()
      } else if (e.key === "Escape") {
        setEditingCell(null)
      }
    },
    [commitEdit],
  )

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    )
  }

  if (!data || data.groups.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {type === "income" ? "수입" : "지출"} 카테고리에 등록된 예산이 없습니다.
      </p>
    )
  }

  return (
    <div className="overflow-auto rounded-lg border max-h-[70vh]">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-muted">
            <th className="sticky left-0 top-0 z-30 min-w-[120px] bg-muted px-3 py-2 text-left text-xs font-medium">
              카테고리
            </th>
            {MONTHS.map((m) => (
              <th
                key={m}
                className="sticky top-0 z-10 min-w-[80px] bg-muted px-1 py-2 text-right text-xs font-medium whitespace-nowrap"
              >
                {MONTH_LABELS[m - 1]}
              </th>
            ))}
            <th className="sticky top-0 z-10 min-w-[90px] bg-muted px-2 py-2 text-right text-xs font-medium">
              합계
            </th>
          </tr>
        </thead>
        <tbody>
          {data.groups.map((group) => (
            <GroupRows
              key={group.parent.id}
              group={group}
              editingCell={editingCell}
              editValue={editValue}
              inputRef={inputRef}
              onCellClick={handleCellClick}
              onEditValueChange={setEditValue}
              onBlur={commitEdit}
              onKeyDown={handleKeyDown}
            />
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t bg-muted font-semibold">
            <td className="sticky left-0 z-10 bg-muted px-3 py-2 text-xs">
              월합계
            </td>
            {MONTHS.map((m) => (
              <td
                key={m}
                className="px-2 py-2 text-right font-mono text-xs"
              >
                {formatCompact(data.monthlyTotals[m] ?? 0)}
              </td>
            ))}
            <td className="px-3 py-2 text-right font-mono text-xs font-bold">
              {formatCompact(data.grandTotal)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// --- Sub-components ---

interface GroupRowsProps {
  group: AnnualGridGroup
  editingCell: { categoryId: string; month: number } | null
  editValue: string
  inputRef: React.RefObject<HTMLInputElement | null>
  onCellClick: (categoryId: string, month: number, value: number) => void
  onEditValueChange: (value: string) => void
  onBlur: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
}

function GroupRows({
  group,
  editingCell,
  editValue,
  inputRef,
  onCellClick,
  onEditValueChange,
  onBlur,
  onKeyDown,
}: GroupRowsProps) {
  const parentCat = group.categories[0]
  const childCats = group.categories.slice(1)
  const showSubtotal = childCats.length > 0

  // 소분류 합계 (대분류 제외)
  const childMonthlyTotals: Record<number, number> = {}
  let childTotal = 0
  for (let m = 1; m <= 12; m++) {
    const sum = childCats.reduce((s, c) => s + (c.months[m] ?? 0), 0)
    childMonthlyTotals[m] = sum
    childTotal += sum
  }

  return (
    <>
      {/* 대분류 행 */}
      {parentCat && (
        <CategoryRow
          key={parentCat.id}
          cat={parentCat}
          isParent
          editingCell={editingCell}
          editValue={editValue}
          inputRef={inputRef}
          onCellClick={onCellClick}
          onEditValueChange={onEditValueChange}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
        />
      )}

      {/* 소분류 행 */}
      {childCats.map((cat) => (
        <CategoryRow
          key={cat.id}
          cat={cat}
          editingCell={editingCell}
          editValue={editValue}
          inputRef={inputRef}
          onCellClick={onCellClick}
          onEditValueChange={onEditValueChange}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
        />
      ))}

      {/* 소계 (소분류 합계, 대분류 예산 초과 시 빨간색) */}
      {showSubtotal && (
        <tr className="border-b bg-muted">
          <td className="sticky left-0 z-10 bg-muted px-3 py-1.5 pl-8 text-xs font-semibold text-muted-foreground">
            소계
          </td>
          {MONTHS.map((m) => {
            const childSum = childMonthlyTotals[m] ?? 0
            const parentBudget = parentCat?.months[m] ?? 0
            const isOver = childSum > parentBudget && parentBudget > 0
            return (
              <td
                key={m}
                className={`px-2 py-1.5 text-right font-mono text-xs font-semibold ${
                  isOver ? "text-red-600" : "text-muted-foreground"
                }`}
              >
                {formatCompact(childSum)}
              </td>
            )
          })}
          <td
            className={`px-3 py-1.5 text-right font-mono text-xs font-bold ${
              childTotal > (parentCat?.total ?? 0) && (parentCat?.total ?? 0) > 0
                ? "text-red-600"
                : "text-muted-foreground"
            }`}
          >
            {formatCompact(childTotal)}
          </td>
        </tr>
      )}
    </>
  )
}

interface CategoryRowProps {
  cat: AnnualGridCategory
  isParent?: boolean
  editingCell: { categoryId: string; month: number } | null
  editValue: string
  inputRef: React.RefObject<HTMLInputElement | null>
  onCellClick: (categoryId: string, month: number, value: number) => void
  onEditValueChange: (value: string) => void
  onBlur: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
}

function CategoryRow({
  cat,
  isParent = false,
  editingCell,
  editValue,
  inputRef,
  onCellClick,
  onEditValueChange,
  onBlur,
  onKeyDown,
}: CategoryRowProps) {
  return (
    <tr className="border-b border-border/50 hover:bg-muted">
      <td className={`sticky left-0 z-10 bg-background px-3 py-1.5 text-sm ${isParent ? "pl-3 font-semibold" : "pl-8"}`}>
        {cat.icon && <span className="mr-1.5 text-xs">{cat.icon}</span>}
        {cat.name}
      </td>
      {MONTHS.map((m) => {
        const value = cat.months[m] ?? 0
        const isEditing =
          editingCell?.categoryId === cat.id && editingCell?.month === m

        return (
          <td key={m} className="px-1 py-1">
            {isEditing ? (
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                value={editValue}
                onChange={(e) => onEditValueChange(e.target.value)}
                onBlur={onBlur}
                onKeyDown={onKeyDown}
                className="h-7 w-full min-w-[70px] rounded border border-ring bg-background px-1.5 text-right font-mono text-sm outline-none ring-2 ring-ring/30"
              />
            ) : (
              <div
                className="cursor-pointer rounded px-1.5 py-0.5 text-right font-mono text-sm transition-colors hover:bg-accent/50"
                onClick={() => onCellClick(cat.id, m, value)}
              >
                {value > 0 ? (
                  formatCompact(value)
                ) : (
                  <span className="text-muted-foreground/40">-</span>
                )}
              </div>
            )}
          </td>
        )
      })}
      <td className="px-3 py-1.5 text-right font-mono text-sm font-medium">
        {formatCompact(cat.total)}
      </td>
    </tr>
  )
}
