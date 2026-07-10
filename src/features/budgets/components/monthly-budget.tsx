"use client"

import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { useCategories } from "@/features/categories/hooks/use-categories"
import { MonthNavigator } from "@/features/transactions/components/month-navigator"
import { AmountInput } from "@/features/budgets/components/amount-input"
import { useBudgetMutations } from "@/features/budgets/hooks/use-budget-mutations"
import {
  useBudgetActuals,
  useBudgetDetail,
  useBudgets,
} from "@/features/budgets/hooks/use-budgets"
import {
  baselineDraft,
  buildMonthlyRows,
  draftTotals,
  isDraftDirty,
  toItemsInput,
  type BudgetGroup,
  type MonthlyRow,
  type PlannedDraft,
} from "@/features/budgets/lib/monthly-editor"
import { formatKrw } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useToastStore } from "@/stores/toast-store"

const GROUP_LABELS: { group: BudgetGroup; label: string }[] = [
  { group: "income", label: "수입" },
  { group: "consumption", label: "소비" },
  { group: "saving", label: "저축" },
]

function progressOf(row: MonthlyRow, planned: number): number | null {
  if (planned <= 0) return null
  return Math.min((row.actual / planned) * 100, 100)
}

/** 카테고리 행 — 계획 인라인 입력 + 실적 진행 바를 한 행에 결합 (UI.md §5 예산 ①) */
function BudgetRow({
  row,
  planned,
  onChange,
}: {
  row: MonthlyRow
  planned: number
  onChange: (amount: number) => void
}) {
  const progress = progressOf(row, planned)
  const isOver = planned > 0 && row.actual > planned

  return (
    <li className="flex items-center gap-3 py-2.5">
      <div className={cn("min-w-0 flex-1", row.parentId && "pl-4")}>
        <p
          className={cn(
            "truncate text-sm",
            row.parentId ? "text-ink-muted" : "font-medium text-ink",
          )}
        >
          {row.categoryName}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
            {progress !== null && (
              <div
                className={cn(
                  "h-full rounded-full",
                  isOver ? "bg-destructive" : "bg-ink/60",
                )}
                style={{ width: `${progress}%` }}
              />
            )}
          </div>
          <span
            className={cn(
              "shrink-0 text-xs tabular-nums",
              isOver ? "text-destructive" : "text-ink-muted",
            )}
          >
            실적 {formatKrw(row.actual)}
          </span>
        </div>
      </div>
      {row.readonly || row.categoryId === null ? (
        <span className="w-28 text-right text-sm text-ink-muted tabular-nums">
          {formatKrw(planned)}
        </span>
      ) : (
        <AmountInput
          value={planned}
          onChange={onChange}
          aria-label={`${row.categoryName} 계획 금액`}
          data-testid={`budget-input-${row.categoryName}`}
          className="h-9 w-28"
        />
      )}
    </li>
  )
}

/** 월별 예산 — 인라인 편집 + dirty 하단 고정 저장 바 + 전월 복사 CTA (PRD §3.5) */
export function MonthlyBudget({
  ym,
  onYmChange,
}: {
  ym: string
  onYmChange: (ym: string) => void
}) {
  const [year, month] = ym.split("-").map(Number)
  const showToast = useToastStore((state) => state.show)

  const { data: categories = [], isPending: categoriesPending } = useCategories()
  const budgetsQuery = useBudgets(year)
  const budget = budgetsQuery.data?.find((item) => item.month === month)
  const detailQuery = useBudgetDetail(budget?.id)
  const actualsQuery = useBudgetActuals(ym)
  const { create, update, copy } = useBudgetMutations()

  const detail = budget ? (detailQuery.data ?? null) : null
  const baseline = useMemo(() => baselineDraft(categories, detail), [categories, detail])
  const [edits, setEdits] = useState<PlannedDraft>({})
  const draft = useMemo(() => ({ ...baseline, ...edits }), [baseline, edits])
  const dirty = isDraftDirty(draft, baseline)

  const rows = useMemo(
    () => buildMonthlyRows(categories, detail, actualsQuery.data?.categories ?? []),
    [categories, detail, actualsQuery.data],
  )
  const totals = useMemo(() => draftTotals(rows, draft), [rows, draft])

  // 미저장 변경 이탈 경고 (PRD §3.5)
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  const isSaving = create.isPending || update.isPending
  const isLoading =
    categoriesPending || budgetsQuery.isPending || (budget !== undefined && detailQuery.isPending)

  function save() {
    const items = toItemsInput(draft)
    const onSuccess = () => {
      setEdits({})
      showToast("예산이 저장되었습니다")
    }
    if (budget) {
      update.mutate({ id: budget.id, input: { items } }, { onSuccess })
    } else {
      create.mutate({ name: `${year}년 ${month}월 예산`, year, month, items }, { onSuccess })
    }
  }

  function copyPreviousMonth() {
    const source =
      month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
    copy.mutate(
      {
        sourceYear: source.year,
        sourceMonth: source.month,
        targetYear: year,
        targetMonth: month,
      },
      { onSuccess: () => showToast("전월 예산을 복사했습니다") },
    )
  }

  return (
    <section aria-label="월별 예산" className="flex flex-col gap-4">
      <MonthNavigator ym={ym} onChange={onYmChange} />

      {isLoading ? (
        <div className="flex flex-col gap-2" aria-hidden>
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="h-14 animate-pulse rounded-xl bg-surface-sunken" />
          ))}
        </div>
      ) : (
        <>
          {/* 목록 재조회 중에는 숨김 — 저장 직후 잔상 CTA 오클릭 방지 */}
          {budget === undefined && !budgetsQuery.isFetching && (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-hairline bg-surface-raised px-4 py-6 text-center">
              <p className="text-sm font-medium text-ink">
                {year}년 {month}월 예산이 아직 없습니다
              </p>
              <p className="text-xs text-ink-muted">
                전월 예산을 복사하거나, 아래 0원 그리드에 바로 입력해 시작하세요.
              </p>
              <Button
                onClick={copyPreviousMonth}
                disabled={copy.isPending}
                data-testid="copy-previous-month"
              >
                전월 예산 복사
              </Button>
            </div>
          )}

          {GROUP_LABELS.map(({ group, label }) => {
            const groupRows = rows.filter((row) => row.group === group)
            if (groupRows.length === 0) return null
            const actualSum = groupRows.reduce((sum, row) => sum + row.actual, 0)
            return (
              <div
                key={group}
                className="rounded-2xl border border-hairline bg-surface-raised px-4 py-2"
              >
                <header className="flex items-baseline justify-between border-b border-hairline py-2">
                  <h3 className="text-sm font-semibold text-ink">{label}</h3>
                  <p className="text-xs text-ink-muted tabular-nums">
                    계획{" "}
                    <span
                      className="font-medium text-ink"
                      data-testid={`budget-total-${group}`}
                    >
                      {formatKrw(totals[group])}
                    </span>
                    {" · "}실적 {formatKrw(actualSum)}
                  </p>
                </header>
                <ul className="divide-y divide-hairline/60">
                  {groupRows.map((row) => (
                    <BudgetRow
                      key={row.categoryId ?? `extra-${row.categoryName}`}
                      row={row}
                      planned={
                        row.categoryId !== null
                          ? (draft[row.categoryId] ?? 0)
                          : row.planned
                      }
                      onChange={(amount) => {
                        if (row.categoryId === null) return
                        setEdits((prev) => ({ ...prev, [row.categoryId as string]: amount }))
                      }}
                    />
                  ))}
                </ul>
              </div>
            )
          })}
        </>
      )}

      {dirty && (
        <div className="fixed inset-x-0 bottom-[calc(var(--nav-height)+env(safe-area-inset-bottom))] z-30 border-t border-hairline bg-surface-raised/95 px-4 py-3 backdrop-blur md:bottom-0 md:left-52">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
            <p className="text-xs text-ink-muted">저장되지 않은 변경이 있습니다</p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setEdits({})} disabled={isSaving}>
                되돌리기
              </Button>
              <Button onClick={save} disabled={isSaving} data-testid="save-budget">
                {isSaving ? "저장 중…" : "예산 저장"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
