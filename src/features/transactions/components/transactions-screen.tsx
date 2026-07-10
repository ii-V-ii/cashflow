"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useMemo, useState } from "react"

import { BottomSheet } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { RecurringTab } from "@/features/recurring/components/recurring-tab"
import { MonthNavigator } from "@/features/transactions/components/month-navigator"
import { TransactionForm } from "@/features/transactions/components/transaction-form"
import { TransactionList } from "@/features/transactions/components/transaction-list"
import {
  useDeleteTransaction,
  useUpdateTransaction,
} from "@/features/transactions/hooks/use-transaction-mutations"
import {
  useTransactionsList,
  useTransactionsMonth,
} from "@/features/transactions/hooks/use-transactions"
import { formatKrw } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useToastStore } from "@/stores/toast-store"
import type { CreateTransactionInput } from "@/lib/validators/transaction"
import type { TransactionDto } from "@/types/api"

const TYPE_FILTERS = [
  { value: undefined, label: "전체" },
  { value: "expense", label: "지출" },
  { value: "income", label: "수입" },
  { value: "transfer", label: "이체" },
] as const

function currentYm(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

/** 거래 화면 — 필터 상태는 URL에 유지 (UI.md §5 거래) */
export function TransactionsScreen() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const showToast = useToastStore((state) => state.show)

  const tab = searchParams.get("tab") === "recurring" ? "recurring" : "all"
  const ym = searchParams.get("ym") ?? currentYm()
  const typeFilter = (searchParams.get("type") ?? undefined) as
    | "income"
    | "expense"
    | "transfer"
    | undefined
  const search = searchParams.get("search") ?? ""
  const page = Number(searchParams.get("page") ?? "1")

  const setParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) params.delete(key)
        else params.set(key, value)
      }
      router.replace(`/transactions?${params.toString()}`)
    },
    [router, searchParams],
  )

  const isFiltered = Boolean(typeFilter || search)
  // 정기 거래 탭에서는 거래 목록 요청을 만들지 않는다 (불필요한 왕복 방지)
  const monthQuery = useTransactionsMonth(ym, tab === "all")
  const listQuery = useTransactionsList(
    { type: typeFilter, search: search || undefined },
    page,
    20,
    isFiltered && tab === "all",
  )
  const activeQuery = isFiltered ? listQuery : monthQuery
  const items = useMemo(
    () => activeQuery.data?.items ?? [],
    [activeQuery.data],
  )

  const summary = useMemo(() => {
    const source = monthQuery.data?.items ?? []
    let income = 0
    let expense = 0
    for (const item of source) {
      if (item.type === "income") income += item.amount
      if (item.type === "expense") expense += item.amount
    }
    return { income, expense }
  }, [monthQuery.data])

  const [editing, setEditing] = useState<TransactionDto | null>(null)
  const [deleting, setDeleting] = useState<TransactionDto | null>(null)
  const updateMutation = useUpdateTransaction()
  const deleteMutation = useDeleteTransaction()

  function handleUpdate(input: CreateTransactionInput) {
    if (!editing) return
    updateMutation.mutate({ id: editing.id, input, previous: editing })
    setEditing(null)
    showToast("수정되었습니다")
  }

  function handleDelete() {
    if (!deleting) return
    deleteMutation.mutate(deleting)
    setDeleting(null)
    setEditing(null)
    showToast("삭제되었습니다")
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pt-4">
      {/* 탭: 전체 | 정기 거래 (PRD §3.2) — 상태는 URL에 유지 */}
      <div
        role="tablist"
        aria-label="거래 화면 탭"
        className="grid grid-cols-2 gap-1 rounded-xl bg-surface-sunken p-1"
      >
        {(
          [
            { value: "all", label: "전체" },
            { value: "recurring", label: "정기 거래" },
          ] as const
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={tab === option.value}
            data-testid={`transactions-tab-${option.value}`}
            onClick={() =>
              setParams({
                tab: option.value === "all" ? null : option.value,
                page: null,
              })
            }
            className={cn(
              "h-11 rounded-lg text-sm font-medium text-ink-muted transition-colors",
              tab === option.value && "bg-surface-raised font-semibold text-ink shadow-sm",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {tab === "recurring" && <RecurringTab />}

      {tab === "all" && (
        <>
          <MonthNavigator ym={ym} onChange={(next) => setParams({ ym: next, page: null })} />

          {/* 상단 요약 — 카드 아님, 여백과 타이포만 (UI.md §3.2 레이아웃 리듬) */}
          {!isFiltered && (
            <section aria-label="월 요약" className="flex items-end justify-between px-1">
              <div>
                <p className="text-xs text-ink-muted">이번 달 지출</p>
                <p
                  className="amount text-[length:var(--text-amount-hero)] font-bold leading-tight text-ink"
                  data-testid="month-expense-total"
                >
                  {formatKrw(summary.expense)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-ink-muted">수입</p>
                <p className="amount text-[length:var(--text-amount-md)] font-semibold text-income-fg">
                  {formatKrw(summary.income)}
                </p>
              </div>
            </section>
          )}

          {/* 필터 칩 + 검색 — 상태를 URL에 유지 */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {TYPE_FILTERS.map((filter) => (
              <button
                key={filter.label}
                type="button"
                onClick={() =>
                  setParams({ type: filter.value ?? null, page: null })
                }
                className={cn(
                  "h-11 shrink-0 rounded-full border border-hairline px-4 text-sm text-ink-muted transition-colors",
                  typeFilter === filter.value &&
                    "border-ink bg-surface-sunken font-medium text-ink",
                )}
              >
                {filter.label}
              </button>
            ))}
            <Input
              type="search"
              defaultValue={search}
              placeholder="내용·메모 검색"
              aria-label="거래 검색"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setParams({
                    search: event.currentTarget.value || null,
                    page: null,
                  })
                }
              }}
              className="h-11 min-w-36 flex-1"
            />
          </div>

          {activeQuery.isPending ? (
            <div className="flex flex-col gap-2" aria-hidden>
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-16 animate-pulse rounded-xl bg-surface-sunken" />
              ))}
            </div>
          ) : activeQuery.isError ? (
            <div className="flex flex-col items-center gap-3 py-16">
              <p className="text-sm text-ink-muted">목록을 불러오지 못했습니다</p>
              <Button variant="outline" className="h-11" onClick={() => activeQuery.refetch()}>
                다시 시도
              </Button>
            </div>
          ) : (
            <TransactionList items={items} onSelect={setEditing} />
          )}

          {/* 필터 모드 페이지네이션 */}
          {isFiltered && activeQuery.data && activeQuery.data.total > activeQuery.data.limit && (
            <nav aria-label="페이지" className="flex items-center justify-center gap-3 py-2">
              <Button
                variant="outline"
                className="h-11"
                disabled={page <= 1}
                onClick={() => setParams({ page: String(page - 1) })}
              >
                이전
              </Button>
              <span className="text-sm text-ink-muted">
                {page} / {Math.ceil(activeQuery.data.total / activeQuery.data.limit)}
              </span>
              <Button
                variant="outline"
                className="h-11"
                disabled={page >= Math.ceil(activeQuery.data.total / activeQuery.data.limit)}
                onClick={() => setParams({ page: String(page + 1) })}
              >
                다음
              </Button>
            </nav>
          )}
        </>
      )}

      {/* 수정 시트 */}
      <BottomSheet
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title="거래 수정"
      >
        {editing && (
          <div className="flex flex-col gap-3">
            <TransactionForm
              initial={editing}
              isPending={updateMutation.isPending}
              submitLabel="수정 저장"
              onSubmit={handleUpdate}
            />
            <Button
              variant="destructive"
              className="h-11 w-full"
              data-testid="delete-transaction"
              onClick={() => setDeleting(editing)}
            >
              이 거래 삭제
            </Button>
          </div>
        )}
      </BottomSheet>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="거래를 삭제할까요?"
        description={
          deleting
            ? `'${deleting.description}' ${formatKrw(deleting.amount)} 기록이 삭제되고 잔액이 복원됩니다.`
            : ""
        }
        onConfirm={handleDelete}
        isPending={deleteMutation.isPending}
      />
    </main>
  )
}
