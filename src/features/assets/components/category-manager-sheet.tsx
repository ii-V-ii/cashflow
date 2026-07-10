"use client"

import { useState } from "react"

import { BottomSheet } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { useAssetCategoryMutations } from "@/features/assets/hooks/use-assets"
import { useToastStore } from "@/stores/toast-store"
import type { AssetCategoryDto } from "@/types/api"


/** 자산 카테고리 관리 시트 — 인라인 추가·이름 수정·삭제 (PRD §3.7) */
export function CategoryManagerSheet({
  open,
  onOpenChange,
  categories,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: AssetCategoryDto[]
}) {
  const { create, update, remove } = useAssetCategoryMutations()
  const showToast = useToastStore((state) => state.show)
  const [name, setName] = useState("")
  const [kind, setKind] = useState<"financial" | "non_financial">("financial")
  const [deleting, setDeleting] = useState<AssetCategoryDto | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")

  function commitRename(category: AssetCategoryDto) {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== category.name) {
      update.mutate({ id: category.id, input: { name: trimmed } })
    }
    setRenamingId(null)
  }

  function handleAdd(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    create.mutate(
      { name: name.trim(), kind, sortOrder: categories.length },
      {
        onSuccess: () => {
          showToast("카테고리가 추가되었습니다")
          setName("")
        },
      },
    )
  }

  return (
    <>
      <BottomSheet open={open} onOpenChange={onOpenChange} title="자산 카테고리 관리">
        <div className="flex flex-col gap-4">
          <form onSubmit={handleAdd} className="flex gap-2">
            <Input
              value={name}
              placeholder="새 카테고리 이름"
              data-testid="asset-category-name-input"
              onChange={(event) => setName(event.target.value)}
              className="h-11 flex-1"
            />
            <select
              value={kind}
              aria-label="카테고리 종류"
              onChange={(event) =>
                setKind(event.target.value as "financial" | "non_financial")
              }
              className="h-11 rounded-lg border border-hairline bg-surface-raised px-2 text-sm text-ink"
            >
              <option value="financial">금융</option>
              <option value="non_financial">비금융</option>
            </select>
            <Button
              type="submit"
              disabled={create.isPending}
              className="h-11 bg-ink px-3 text-surface-raised"
            >
              추가
            </Button>
          </form>

          {categories.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">
              카테고리가 없습니다. 먼저 추가해주세요.
            </p>
          ) : (
            <ul className="divide-y divide-hairline rounded-xl ring-1 ring-hairline">
              {categories.map((category) => (
                <li key={category.id} className="flex items-center gap-2 px-3 py-2">
                  {renamingId === category.id ? (
                    <Input
                      autoFocus
                      value={renameValue}
                      aria-label={`${category.name} 이름 변경`}
                      onChange={(event) => setRenameValue(event.target.value)}
                      onBlur={() => commitRename(category)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault()
                          commitRename(category)
                        }
                        if (event.key === "Escape") setRenamingId(null)
                      }}
                      className="h-9 flex-1"
                    />
                  ) : (
                    <span className="flex-1 text-sm text-ink">{category.name}</span>
                  )}
                  <span className="text-[11px] text-ink-muted">
                    {category.kind === "financial" ? "금융" : "비금융"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setRenamingId(category.id)
                      setRenameValue(category.name)
                    }}
                    className="rounded-lg px-2 py-2 text-xs text-ink-muted hover:bg-surface-sunken"
                  >
                    이름 변경
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(category)}
                    className="rounded-lg px-2 py-2 text-xs text-loss hover:bg-surface-sunken"
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(isOpen) => !isOpen && setDeleting(null)}
        title="카테고리를 삭제할까요?"
        description={
          deleting
            ? `'${deleting.name}' 카테고리를 삭제합니다. 자산이 참조 중이면 삭제할 수 없습니다.`
            : ""
        }
        onConfirm={() => {
          if (deleting) {
            remove.mutate(deleting.id, {
              onSuccess: () => showToast("카테고리가 삭제되었습니다"),
            })
          }
          setDeleting(null)
        }}
        isPending={remove.isPending}
      />
    </>
  )
}
