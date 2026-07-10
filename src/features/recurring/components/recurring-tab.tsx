"use client"

import { PlusIcon } from "lucide-react"
import { useState } from "react"

import { BottomSheet } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { RecurringForm } from "@/features/recurring/components/recurring-form"
import { frequencyLabel } from "@/features/recurring/format"
import { useRecurringList } from "@/features/recurring/hooks/use-recurring"
import { useRecurringMutations } from "@/features/recurring/hooks/use-recurring-mutations"
import { formatKrw } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useToastStore } from "@/stores/toast-store"
import type { CreateRecurringInput } from "@/lib/validators/recurring"
import type { RecurringDto } from "@/types/api"

const TYPE_LABEL: Record<RecurringDto["type"], { label: string; className: string }> = {
  income: { label: "수입", className: "bg-income-subtle text-income-fg" },
  expense: { label: "지출", className: "bg-expense-subtle text-expense-fg" },
  transfer: { label: "이체", className: "bg-transfer-subtle text-transfer-fg" },
}

/** 정기 거래 탭 (PRD §3.2) — 규칙 목록·활성 토글·등록/수정/삭제 */
export function RecurringTab() {
  const listQuery = useRecurringList()
  const { create, update, remove } = useRecurringMutations()
  const showToast = useToastStore((state) => state.show)

  const [isCreating, setIsCreating] = useState(false)
  const [editing, setEditing] = useState<RecurringDto | null>(null)
  const [deleting, setDeleting] = useState<RecurringDto | null>(null)

  function handleCreate(input: CreateRecurringInput) {
    create.mutate(input, {
      onSuccess: () => {
        setIsCreating(false)
        showToast("정기 거래가 등록되었습니다")
      },
    })
  }

  function handleUpdate(input: CreateRecurringInput) {
    if (!editing) return
    update.mutate(
      { id: editing.id, input },
      {
        onSuccess: () => {
          setEditing(null)
          showToast("수정되었습니다")
        },
      },
    )
  }

  function handleToggle(rule: RecurringDto) {
    update.mutate(
      { id: rule.id, input: { isActive: !rule.isActive } },
      {
        onSuccess: () =>
          showToast(rule.isActive ? "일시정지되었습니다" : "다시 활성화되었습니다"),
      },
    )
  }

  function handleDelete() {
    if (!deleting) return
    remove.mutate(deleting.id, {
      onSuccess: () => showToast("삭제되었습니다"),
    })
    setDeleting(null)
    setEditing(null)
  }

  const rules = listQuery.data ?? []

  return (
    <section aria-label="정기 거래" data-testid="recurring-tab" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-muted">
          규칙 생성 시 향후 12개월치 예정 거래가 만들어집니다
        </p>
        <Button
          variant="outline"
          className="h-11 gap-1"
          data-testid="recurring-add-button"
          onClick={() => setIsCreating(true)}
        >
          <PlusIcon className="size-4" aria-hidden />새 정기 거래
        </Button>
      </div>

      {listQuery.isPending ? (
        <div className="flex flex-col gap-2" aria-hidden>
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-20 animate-pulse rounded-xl bg-surface-sunken" />
          ))}
        </div>
      ) : listQuery.isError ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <p className="text-sm text-ink-muted">정기 거래를 불러오지 못했습니다</p>
          <Button variant="outline" className="h-11" onClick={() => listQuery.refetch()}>
            다시 시도
          </Button>
        </div>
      ) : rules.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <p className="text-sm text-ink-muted">등록된 정기 거래가 없습니다</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {rules.map((rule) => {
            const type = TYPE_LABEL[rule.type]
            return (
              <li key={rule.id}>
                <div
                  className={cn(
                    "flex items-center gap-3 rounded-xl border border-hairline bg-surface-raised px-4 py-3",
                    !rule.isActive && "opacity-60",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setEditing(rule)}
                    data-testid={`recurring-row-${rule.id}`}
                    className="flex min-w-0 flex-1 flex-col gap-1 text-left"
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                          type.className,
                        )}
                      >
                        {type.label}
                      </span>
                      {!rule.isActive && (
                        <span className="rounded-md border border-hairline px-1.5 py-0.5 text-[11px] text-ink-muted">
                          일시정지
                        </span>
                      )}
                      <span className="truncate text-sm font-medium text-ink">
                        {rule.description}
                      </span>
                    </span>
                    <span className="text-xs text-ink-muted">
                      {frequencyLabel(rule.frequency, rule.interval)} · 다음{" "}
                      {rule.nextDate}
                      {rule.endDate ? ` · ~${rule.endDate}` : ""}
                    </span>
                  </button>
                  <span className="amount shrink-0 text-sm font-semibold text-ink">
                    {formatKrw(rule.amount)}
                  </span>
                  {/* 활성 토글 스위치 */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={rule.isActive}
                    aria-label={`${rule.description} 활성`}
                    data-testid={`recurring-toggle-${rule.id}`}
                    disabled={update.isPending}
                    onClick={() => handleToggle(rule)}
                    className={cn(
                      "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                      rule.isActive ? "bg-ink" : "bg-hairline",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "absolute top-0.5 left-0.5 size-5 rounded-full bg-surface-raised shadow-sm transition-transform",
                        rule.isActive && "translate-x-5",
                      )}
                    />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* 등록 시트 */}
      <BottomSheet
        open={isCreating}
        onOpenChange={(open) => !open && setIsCreating(false)}
        title="새 정기 거래"
      >
        <RecurringForm
          isPending={create.isPending}
          submitLabel="등록"
          onSubmit={handleCreate}
        />
      </BottomSheet>

      {/* 수정 시트 */}
      <BottomSheet
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title="정기 거래 수정"
      >
        {editing && (
          <div className="flex flex-col gap-3">
            <RecurringForm
              initial={editing}
              isPending={update.isPending}
              submitLabel="수정 저장"
              onSubmit={handleUpdate}
            />
            <Button
              variant="destructive"
              className="h-11 w-full"
              data-testid="recurring-delete"
              onClick={() => setDeleting(editing)}
            >
              이 정기 거래 삭제
            </Button>
          </div>
        )}
      </BottomSheet>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="정기 거래를 삭제할까요?"
        description={
          deleting
            ? `'${deleting.description}' 규칙과 예정 거래가 삭제됩니다. 이미 적용된 거래는 보존됩니다.`
            : ""
        }
        onConfirm={handleDelete}
        isPending={remove.isPending}
      />
    </section>
  )
}
