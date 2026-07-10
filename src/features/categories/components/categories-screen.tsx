"use client"

import { ArrowDownIcon, ArrowUpIcon, PlusIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { BottomSheet } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import {
  useCategories,
  useCategoryMutations,
} from "@/features/categories/hooks/use-categories"
import { cn } from "@/lib/utils"
import { useToastStore } from "@/stores/toast-store"
import type { CategoryDto } from "@/types/api"

type CategoryTab = "expense" | "income"

interface CategoryFormState {
  name: string
  expenseKind: "consumption" | "saving"
  parentId: string
}

const EMPTY_FORM: CategoryFormState = {
  name: "",
  expenseKind: "consumption",
  parentId: "",
}

/** 카테고리 관리 — 대분류/소분류 2단계, 버튼식 상하 정렬 */
export function CategoriesScreen() {
  const [tab, setTab] = useState<CategoryTab>("expense")
  const { data: categories = [], isPending } = useCategories(tab)
  const { create, update, remove, reorder } = useCategoryMutations()
  const showToast = useToastStore((state) => state.show)

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<CategoryFormState>(EMPTY_FORM)
  const [deleting, setDeleting] = useState<CategoryDto | null>(null)

  const parents = useMemo(
    () => categories.filter((category) => category.parentId === null),
    [categories],
  )
  const childrenOf = (parentId: string) =>
    categories.filter((category) => category.parentId === parentId)

  function openCreate(parentId = "") {
    setEditingId(null)
    setForm({ ...EMPTY_FORM, parentId })
    setEditorOpen(true)
  }

  function openEdit(category: CategoryDto) {
    setEditingId(category.id)
    setForm({
      name: category.name,
      expenseKind: category.expenseKind ?? "consumption",
      parentId: category.parentId ?? "",
    })
    setEditorOpen(true)
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const base = {
      name: form.name,
      type: tab,
      expenseKind: tab === "expense" ? form.expenseKind : undefined,
      parentId: form.parentId || undefined,
    }
    if (editingId) {
      update.mutate(
        { id: editingId, input: base },
        { onSuccess: () => showToast("카테고리가 수정되었습니다") },
      )
    } else {
      create.mutate(base, { onSuccess: () => showToast("카테고리가 추가되었습니다") })
    }
    setEditorOpen(false)
  }

  function handleDelete() {
    if (!deleting) return
    remove.mutate(deleting.id, {
      onSuccess: () => showToast("카테고리가 삭제되었습니다"),
    })
    setDeleting(null)
  }

  function moveParent(index: number, delta: -1 | 1) {
    const target = index + delta
    if (target < 0 || target >= parents.length) return
    const next = [...parents]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    reorder.mutate(next.map((category, order) => ({ id: category.id, sortOrder: order })))
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pt-6">
      <header className="flex items-center justify-between px-1">
        <h1 className="text-lg font-semibold text-ink">카테고리</h1>
        <Button onClick={() => openCreate()} className="h-11 bg-ink px-4 text-surface-raised hover:bg-ink/90">
          <PlusIcon className="size-4" /> 추가
        </Button>
      </header>

      <div role="tablist" aria-label="카테고리 유형" className="grid grid-cols-2 gap-1 rounded-xl bg-surface-sunken p-1">
        {(
          [
            { value: "expense", label: "지출" },
            { value: "income", label: "수입" },
          ] as const
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={tab === option.value}
            onClick={() => setTab(option.value)}
            className={cn(
              "h-11 rounded-lg text-sm font-medium text-ink-muted transition-colors",
              tab === option.value && "bg-surface-raised text-ink shadow-sm",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {isPending ? (
        <div className="flex flex-col gap-2" aria-hidden>
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-14 animate-pulse rounded-xl bg-surface-sunken" />
          ))}
        </div>
      ) : parents.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <p className="text-sm text-ink-muted">카테고리가 없습니다</p>
          <Button onClick={() => openCreate()} className="h-11 bg-ink text-surface-raised">
            첫 카테고리 만들기
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {parents.map((parent, index) => (
            <li key={parent.id} className="rounded-xl bg-surface-raised ring-1 ring-hairline">
              <div className="flex items-center gap-2 px-3 py-2">
                <button
                  type="button"
                  onClick={() => openEdit(parent)}
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span
                    aria-hidden
                    className="size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: parent.color ?? "var(--hairline)" }}
                  />
                  <span className="truncate text-sm font-medium text-ink">{parent.name}</span>
                  {parent.expenseKind === "saving" && (
                    <span className="rounded-md bg-saving-subtle px-1.5 py-0.5 text-[11px] text-saving-fg">
                      저축
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  aria-label={`${parent.name} 소분류 추가`}
                  onClick={() => openCreate(parent.id)}
                  className="flex size-11 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-sunken"
                >
                  <PlusIcon className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={`${parent.name} 위로`}
                  disabled={index === 0}
                  onClick={() => moveParent(index, -1)}
                  className="flex size-11 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-sunken disabled:opacity-30"
                >
                  <ArrowUpIcon className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={`${parent.name} 아래로`}
                  disabled={index === parents.length - 1}
                  onClick={() => moveParent(index, 1)}
                  className="flex size-11 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-sunken disabled:opacity-30"
                >
                  <ArrowDownIcon className="size-4" />
                </button>
              </div>
              {childrenOf(parent.id).length > 0 && (
                <ul className="divide-y divide-hairline border-t border-hairline">
                  {childrenOf(parent.id).map((child) => (
                    <li key={child.id}>
                      <button
                        type="button"
                        onClick={() => openEdit(child)}
                        className="flex min-h-11 w-full items-center gap-2 px-3 pl-8 text-left text-sm text-ink-muted hover:bg-surface-sunken/50"
                      >
                        {child.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <BottomSheet
        open={editorOpen}
        onOpenChange={setEditorOpen}
        title={editingId ? "카테고리 수정" : "카테고리 추가"}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
            이름
            <Input
              required
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              className="h-11"
            />
          </label>
          {tab === "expense" && (
            <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
              구분
              <select
                value={form.expenseKind}
                onChange={(event) =>
                  setForm({
                    ...form,
                    expenseKind: event.target.value as CategoryFormState["expenseKind"],
                  })
                }
                className="h-11 rounded-lg border border-hairline bg-surface-raised px-3 text-sm text-ink"
              >
                <option value="consumption">소비</option>
                <option value="saving">저축</option>
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
            상위 카테고리 (선택)
            <select
              value={form.parentId}
              onChange={(event) => setForm({ ...form, parentId: event.target.value })}
              className="h-11 rounded-lg border border-hairline bg-surface-raised px-3 text-sm text-ink"
            >
              <option value="">없음 (대분류)</option>
              {parents
                .filter((parent) => parent.id !== editingId)
                .map((parent) => (
                  <option key={parent.id} value={parent.id}>
                    {parent.name}
                  </option>
                ))}
            </select>
          </label>
          <div className="flex gap-2">
            {editingId && (
              <Button
                type="button"
                variant="destructive"
                className="h-12 flex-1"
                onClick={() => {
                  const category = categories.find((item) => item.id === editingId)
                  if (category) setDeleting(category)
                  setEditorOpen(false)
                }}
              >
                삭제
              </Button>
            )}
            <Button
              type="submit"
              className="h-12 flex-[2] bg-ink text-surface-raised hover:bg-ink/90"
              disabled={create.isPending || update.isPending}
            >
              저장
            </Button>
          </div>
        </form>
      </BottomSheet>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="카테고리를 삭제할까요?"
        description={
          deleting
            ? `'${deleting.name}' 카테고리를 삭제합니다. 거래가 참조 중이면 삭제할 수 없습니다.`
            : ""
        }
        onConfirm={handleDelete}
        isPending={remove.isPending}
      />
    </main>
  )
}
