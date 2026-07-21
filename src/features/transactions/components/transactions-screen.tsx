"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"

import { BottomSheet } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { RecurringTab } from "@/features/recurring/components/recurring-tab"
import { useMonthlySettlement } from "@/features/settlements/hooks/use-settlements"
import { TRANSACTIONS_PAGE_SIZE } from "@/features/transactions/constants"
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
  // 정기 거래 탭·필터 모드에서는 월 원장 요청을 만들지 않는다 (불필요한 왕복 방지)
  const monthQuery = useTransactionsMonth(ym, page, tab === "all" && !isFiltered)
  const listQuery = useTransactionsList(
    { type: typeFilter, search: search || undefined },
    page,
    TRANSACTIONS_PAGE_SIZE,
    isFiltered && tab === "all",
  )
  const activeQuery = isFiltered ? listQuery : monthQuery
  const items = useMemo(
    () => activeQuery.data?.items ?? [],
    [activeQuery.data],
  )

  // 상단 요약은 결산 RPC 값을 그대로 쓴다 — 목록 items 클라이언트 합산 금지
  // (100건 초과 월에서 원장 페이지 절단으로 합계가 실제보다 낮게 보이던 버그의 근본 수정).
  const settlementQuery = useMonthlySettlement(ym, tab === "all" && !isFiltered)

  // 페이지 범위 클램프 (LOW-7): 마지막 페이지의 마지막 항목을 삭제한 직후처럼 현재 page가
  // 조회 결과의 유효 범위를 넘어서면 마지막 유효 페이지로 되돌린다. 무한 루프 방지: 클램프된
  // page로 이동하면 다음 렌더에서 조건이 거짓이 되어 더 이상 setParams를 호출하지 않는다.
  useEffect(() => {
    if (!activeQuery.data) return
    const { total, limit } = activeQuery.data
    const lastPage = Math.max(1, Math.ceil(total / limit))
    if (page > lastPage) {
      setParams({ page: lastPage === 1 ? null : String(lastPage) })
    }
  }, [activeQuery.data, page, setParams])

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

          {/* 상단 요약 — 카드 아님, 여백과 타이포만 (UI.md §3.2 레이아웃 리듬).
              결산 RPC(settlementQuery)를 그대로 표시 — 목록(activeQuery)과 로딩/에러가 독립적이다. */}
          {!isFiltered && (
            <section aria-label="월 요약" className="flex items-end justify-between px-1">
              <div>
                <p className="text-xs text-ink-muted">이번 달 지출</p>
                {settlementQuery.isPending ? (
                  <div
                    className="h-9 w-32 animate-pulse rounded-md bg-surface-sunken"
                    aria-hidden
                  />
                ) : (
                  <p
                    className="amount text-[length:var(--text-amount-hero)] font-bold leading-tight text-ink"
                    data-testid="month-expense-total"
                  >
                    {settlementQuery.isError
                      ? "—"
                      : formatKrw(settlementQuery.data.expense.total)}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs text-ink-muted">수입</p>
                {settlementQuery.isPending ? (
                  <div
                    className="ml-auto h-6 w-20 animate-pulse rounded-md bg-surface-sunken"
                    aria-hidden
                  />
                ) : (
                  <p className="amount text-[length:var(--text-amount-md)] font-semibold text-income-fg">
                    {settlementQuery.isError
                      ? "—"
                      : formatKrw(settlementQuery.data.income.total)}
                  </p>
                )}
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

          {/* 페이지네이션 — 필터 모드뿐 아니라 기본(월 원장) 뷰에서도 100건 초과 시 노출한다
              (버그: 이전엔 기본 뷰에 nav가 없어 절단된 나머지 페이지에 접근할 수 없었다) */}
          {activeQuery.data && activeQuery.data.total > activeQuery.data.limit && (
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
