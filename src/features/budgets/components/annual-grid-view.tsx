"use client"

import { useMemo, useState } from "react"

import { useCategories } from "@/features/categories/hooks/use-categories"
import { AmountInput } from "@/features/budgets/components/amount-input"
import { YearNavigator } from "@/features/budgets/components/year-navigator"
import { useBudgetMutations } from "@/features/budgets/hooks/use-budget-mutations"
import { useAnnualGrid } from "@/features/budgets/hooks/use-budgets"
import { buildGridModel, type GridRow } from "@/features/budgets/lib/annual-grid"
import { cn } from "@/lib/utils"

const TYPE_TABS = [
  { value: "expense", label: "지출" },
  { value: "income", label: "수입" },
] as const

type BudgetType = (typeof TYPE_TABS)[number]["value"]

const krw = new Intl.NumberFormat("ko-KR")

function CellValue({ amount, muted }: { amount: number; muted?: boolean }) {
  return (
    <span className={cn("tabular-nums", amount === 0 ? "text-ink-muted/50" : muted ? "text-ink-muted" : "text-ink")}>
      {amount === 0 ? "·" : krw.format(amount)}
    </span>
  )
}

interface EditingCell {
  categoryId: string
  month: number
  amount: number
}

/** 편집 가능한 셀 — 탭하면 인라인 입력, 확정 시 upsert (API.md §6.9) */
function EditableCell({
  row,
  monthIndex,
  editing,
  onStartEdit,
  onEditChange,
  onCommit,
}: {
  row: GridRow
  monthIndex: number
  editing: EditingCell | null
  onStartEdit: (cell: EditingCell) => void
  onEditChange: (amount: number) => void
  onCommit: () => void
}) {
  const month = monthIndex + 1
  const isEditing = editing?.categoryId === row.categoryId && editing.month === month

  if (isEditing) {
    return (
      <AmountInput
        autoFocus
        value={editing.amount}
        onChange={onEditChange}
        onBlur={onCommit}
        onKeyDown={(event) => {
          if (event.key === "Enter") onCommit()
        }}
        aria-label={`${row.categoryName} ${month}월 계획`}
        className="h-8 w-24"
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() =>
        onStartEdit({ categoryId: row.categoryId, month, amount: row.months[monthIndex] })
      }
      data-testid={`grid-cell-${row.categoryName}-${month}`}
      className="block min-h-11 w-full rounded-md px-2 text-right transition-colors hover:bg-surface-sunken"
    >
      <CellValue amount={row.months[monthIndex]} />
    </button>
  )
}

/** 연간 그리드 — 12개월 × 카테고리, 첫 열 고정 가로 스크롤 (UI.md §5 예산 ③) */
export function AnnualGridView({
  year,
  onYearChange,
}: {
  year: number
  onYearChange: (year: number) => void
}) {
  const [type, setType] = useState<BudgetType>("expense")
  const { data: categories = [], isPending } = useCategories(type)
  const gridQuery = useAnnualGrid(year)
  const { upsertCell } = useBudgetMutations()
  const [editing, setEditing] = useState<EditingCell | null>(null)

  const model = useMemo(
    () => buildGridModel(categories, gridQuery.data),
    [categories, gridQuery.data],
  )

  function commitEdit() {
    if (!editing) return
    const group = model.groups.find((item) =>
      item.rows.some((row) => row.categoryId === editing.categoryId),
    )
    const row = group?.rows.find((item) => item.categoryId === editing.categoryId)
    const current = row?.months[editing.month - 1] ?? 0
    if (current !== editing.amount) {
      upsertCell.mutate({
        year,
        month: editing.month,
        categoryId: editing.categoryId,
        amount: editing.amount,
      })
    }
    setEditing(null)
  }

  const headerCellClass = "px-2 py-2 text-right text-xs font-medium text-ink-muted"
  const stickyCellClass =
    "sticky left-0 z-10 min-w-28 max-w-40 bg-surface px-3 py-1.5 text-left"

  return (
    <section aria-label="연간 그리드" className="flex flex-col gap-4">
      <YearNavigator year={year} onChange={onYearChange} />

      <div className="flex gap-1.5" role="group" aria-label="유형 필터">
        {TYPE_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setType(tab.value)}
            aria-pressed={type === tab.value}
            className={cn(
              "min-h-9 rounded-full border px-3.5 text-sm transition-colors",
              type === tab.value
                ? "border-ink bg-ink text-surface-raised"
                : "border-hairline bg-surface-raised text-ink-muted",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isPending || gridQuery.isPending ? (
        <div className="h-64 animate-pulse rounded-2xl bg-surface-sunken" aria-hidden />
      ) : model.groups.length === 0 ? (
        <p className="py-16 text-center text-sm text-ink-muted">
          {type === "expense" ? "지출" : "수입"} 카테고리가 없습니다. 카테고리를 먼저 만들어주세요.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-hairline bg-surface-raised">
          <table className="w-max min-w-full border-collapse text-sm" data-testid="annual-grid">
            <thead>
              <tr className="border-b border-hairline">
                <th className={cn(stickyCellClass, "bg-surface-raised text-xs font-medium text-ink-muted")}>
                  카테고리
                </th>
                {Array.from({ length: 12 }, (_, index) => (
                  <th key={index} className={headerCellClass}>
                    {index + 1}월
                  </th>
                ))}
                <th className={headerCellClass}>합계</th>
              </tr>
            </thead>
            {model.groups.map((group) => (
              <tbody key={group.categoryId} className="border-b border-hairline/60">
                {group.rows.length > 1 && (
                  <tr className="bg-surface-sunken/40">
                    <td className={cn(stickyCellClass, "bg-surface-sunken/40 text-sm font-semibold text-ink")}>
                      {group.categoryName} 소계
                    </td>
                    {group.months.map((amount, index) => (
                      <td key={index} className="px-2 py-1.5 text-right">
                        <CellValue amount={amount} muted />
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right font-medium">
                      <CellValue amount={group.total} />
                    </td>
                  </tr>
                )}
                {group.rows.map((row) => (
                  <tr key={row.categoryId}>
                    <td
                      className={cn(
                        stickyCellClass,
                        row.parentId ? "pl-6 text-ink-muted" : "font-medium text-ink",
                      )}
                    >
                      <span className="block truncate">{row.categoryName}</span>
                    </td>
                    {row.months.map((_, index) => (
                      <td key={index} className="px-1 py-0.5 text-right">
                        <EditableCell
                          row={row}
                          monthIndex={index}
                          editing={editing}
                          onStartEdit={setEditing}
                          onEditChange={(amount) =>
                            setEditing((prev) => (prev ? { ...prev, amount } : prev))
                          }
                          onCommit={commitEdit}
                        />
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right">
                      <CellValue amount={row.total} />
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
            <tfoot>
              <tr className="border-t border-hairline">
                <td className={cn(stickyCellClass, "bg-surface-raised text-sm font-semibold text-ink")}>
                  월합계
                </td>
                {model.monthTotals.map((amount, index) => (
                  <td key={index} className="px-2 py-2 text-right font-medium">
                    <CellValue amount={amount} />
                  </td>
                ))}
                <td className="px-2 py-2 text-right font-semibold" data-testid="grid-grand-total">
                  <CellValue amount={model.grandTotal} />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  )
}
