"use client"

import { useState, useCallback } from "react"
import { Plus, Pencil, Trash2, Settings2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog"
import {
  useAssetCategories,
  useCreateAssetCategory,
  useUpdateAssetCategory,
  useDeleteAssetCategory,
} from "@/hooks/use-asset-categories"
import type { AssetCategoryCustom } from "@/types"

export function AssetCategoryManager() {
  const { data: categories } = useAssetCategories()
  const createMutation = useCreateAssetCategory()
  const updateMutation = useUpdateAssetCategory()
  const deleteMutation = useDeleteAssetCategory()

  const [manageOpen, setManageOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<AssetCategoryCustom | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AssetCategoryCustom | null>(null)

  const [formName, setFormName] = useState("")
  const [formKind, setFormKind] = useState<"financial" | "non_financial">("financial")
  const [formIcon, setFormIcon] = useState("")
  const [formColor, setFormColor] = useState("")

  const handleAdd = useCallback(() => {
    setEditing(null)
    setFormName("")
    setFormKind("financial")
    setFormIcon("")
    setFormColor("")
    setFormOpen(true)
  }, [])

  const handleEdit = useCallback((cat: AssetCategoryCustom) => {
    setEditing(cat)
    setFormName(cat.name)
    setFormKind(cat.kind)
    setFormIcon(cat.icon ?? "")
    setFormColor(cat.color ?? "")
    setFormOpen(true)
  }, [])

  const handleSubmit = useCallback(() => {
    const data = {
      name: formName,
      kind: formKind,
      icon: formIcon || null,
      color: formColor || null,
    }

    if (editing) {
      updateMutation.mutate(
        { id: editing.id, data },
        { onSuccess: () => setFormOpen(false) },
      )
    } else {
      createMutation.mutate(data, {
        onSuccess: () => setFormOpen(false),
      })
    }
  }, [editing, formName, formKind, formIcon, formColor, createMutation, updateMutation])

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteTarget) return
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    })
  }, [deleteTarget, deleteMutation])

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setManageOpen(true)}>
        <Settings2 className="size-4" data-icon="inline-start" />
        카테고리 관리
      </Button>

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>자산 카테고리 관리</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            {categories && categories.length > 0 ? (
              <ul className="divide-y divide-border rounded-lg border">
                {categories.map((cat) => (
                  <li
                    key={cat.id}
                    className="flex items-center gap-3 px-4 py-2.5"
                  >
                    {cat.icon && (
                      <span className="text-lg shrink-0">{cat.icon}</span>
                    )}
                    <span className="flex-1 text-sm font-medium truncate">
                      {cat.name}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {cat.kind === "financial" ? "금융" : "비금융"}
                    </span>
                    {cat.color && (
                      <span
                        className="size-4 rounded-full shrink-0 ring-1 ring-border"
                        style={{ backgroundColor: cat.color }}
                      />
                    )}
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleEdit(cat)}
                        aria-label={`${cat.name} 수정`}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setDeleteTarget(cat)}
                        aria-label={`${cat.name} 삭제`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                자산 카테고리가 없습니다.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setManageOpen(false)}>
              닫기
            </Button>
            <Button size="sm" onClick={handleAdd}>
              <Plus className="size-4" data-icon="inline-start" />
              추가
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 추가/수정 폼 */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {editing ? "자산 카테고리 수정" : "자산 카테고리 추가"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">이름</label>
              <Input
                placeholder="카테고리 이름"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">분류</label>
              <Select value={formKind} onValueChange={(v) => setFormKind(v as typeof formKind)}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(value: string) => value === "financial" ? "금융자산" : "비금융자산"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="financial">금융자산</SelectItem>
                  <SelectItem value="non_financial">비금융자산</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">아이콘 (선택)</label>
              <Input
                placeholder="예: 🏦, 🏠"
                value={formIcon}
                onChange={(e) => setFormIcon(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">색상 (선택)</label>
              <Input
                placeholder="예: #3B82F6"
                value={formColor}
                onChange={(e) => setFormColor(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFormOpen(false)}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              취소
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                !formName.trim() ||
                createMutation.isPending ||
                updateMutation.isPending
              }
            >
              {createMutation.isPending || updateMutation.isPending
                ? "저장 중..."
                : editing
                  ? "수정"
                  : "추가"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="자산 카테고리 삭제"
        description={`"${deleteTarget?.name}" 카테고리를 삭제하시겠습니까?`}
        onConfirm={handleDeleteConfirm}
        isPending={deleteMutation.isPending}
      />
    </>
  )
}
