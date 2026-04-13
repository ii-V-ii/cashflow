"use client"

import { useState, useCallback, useMemo } from "react"
import { Plus, Pencil, Trash2, ChevronRight, FolderPlus, GripVertical } from "lucide-react"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { CategoryFormDialog } from "@/components/categories/CategoryFormDialog"
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog"
import {
  useGroupedCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  useReorderCategories,
} from "@/hooks/use-categories"
import type { Category, CategoryType, CategoryWithChildren } from "@/types"
import type { CreateCategoryInput } from "@/lib/validators/category"

export default function CategoriesPage() {
  const { data: grouped, isLoading } = useGroupedCategories()
  const createMutation = useCreateCategory()
  const updateMutation = useUpdateCategory()
  const deleteMutation = useDeleteCategory()
  const reorderMutation = useReorderCategories()

  const [activeTab, setActiveTab] = useState<CategoryType>("expense")
  const [formOpen, setFormOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [parentIdForNew, setParentIdForNew] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const filtered = useMemo(
    () => grouped?.filter((c) => c.type === activeTab) ?? [],
    [grouped, activeTab],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const handleAddParent = useCallback(() => {
    setEditingCategory(null)
    setParentIdForNew(null)
    setFormOpen(true)
  }, [])

  const handleAddChild = useCallback((parentId: string) => {
    setEditingCategory(null)
    setParentIdForNew(parentId)
    setFormOpen(true)
  }, [])

  const handleEdit = useCallback((category: Category) => {
    setEditingCategory(category)
    setParentIdForNew(category.parentId)
    setFormOpen(true)
  }, [])

  const handleFormSubmit = useCallback(
    (data: CreateCategoryInput) => {
      if (editingCategory) {
        updateMutation.mutate(
          { id: editingCategory.id, data },
          { onSuccess: () => setFormOpen(false) },
        )
      } else {
        createMutation.mutate(data, {
          onSuccess: () => setFormOpen(false),
        })
      }
    },
    [editingCategory, createMutation, updateMutation],
  )

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteTarget) return
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    })
  }, [deleteTarget, deleteMutation])

  const handleParentDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const oldIndex = filtered.findIndex((c) => c.id === active.id)
      const newIndex = filtered.findIndex((c) => c.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return

      const reordered = arrayMove(filtered, oldIndex, newIndex)
      const items = reordered.map((c, i) => ({ id: c.id, sortOrder: i }))
      reorderMutation.mutate(items)
    },
    [filtered, reorderMutation],
  )

  const handleChildDragEnd = useCallback(
    (parentId: string, event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const parent = filtered.find((p) => p.id === parentId)
      if (!parent) return

      const oldIndex = parent.children.findIndex((c) => c.id === active.id)
      const newIndex = parent.children.findIndex((c) => c.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return

      const reordered = arrayMove([...parent.children], oldIndex, newIndex)
      const items = reordered.map((c, i) => ({ id: c.id, sortOrder: i }))
      reorderMutation.mutate(items)
    },
    [filtered, reorderMutation],
  )

  const deleteDescription = deleteTarget
    ? deleteTarget.parentId === null
      ? `"${deleteTarget.name}" 대분류와 하위 소분류를 모두 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`
      : `"${deleteTarget.name}" 소분류를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`
    : ""

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">카테고리</h1>
        <Button size="sm" onClick={handleAddParent}>
          <Plus className="size-4" data-icon="inline-start" />
          대분류 추가
        </Button>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as CategoryType)}
      >
        <TabsList>
          <TabsTrigger value="expense">지출</TabsTrigger>
          <TabsTrigger value="income">수입</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <p>카테고리가 없습니다.</p>
              <Button variant="link" onClick={handleAddParent} className="mt-2">
                첫 카테고리를 추가하세요
              </Button>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleParentDragEnd}
            >
              <SortableContext
                items={filtered.map((c) => c.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="rounded-lg border divide-y divide-border">
                  {filtered.map((parent) => (
                    <SortableParentRow
                      key={parent.id}
                      parent={parent}
                      isExpanded={expandedIds.has(parent.id)}
                      onToggle={() => toggleExpand(parent.id)}
                      onEdit={handleEdit}
                      onDelete={setDeleteTarget}
                      onAddChild={handleAddChild}
                      onChildDragEnd={handleChildDragEnd}
                      sensors={sensors}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </TabsContent>
      </Tabs>

      <CategoryFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        category={editingCategory}
        defaultType={activeTab}
        parentId={parentIdForNew}
        onSubmit={handleFormSubmit}
        isPending={createMutation.isPending || updateMutation.isPending}
      />

      <DeleteConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="카테고리 삭제"
        description={deleteDescription}
        onConfirm={handleDeleteConfirm}
        isPending={deleteMutation.isPending}
      />
    </div>
  )
}

function SortableParentRow({
  parent,
  isExpanded,
  onToggle,
  onEdit,
  onDelete,
  onAddChild,
  onChildDragEnd,
  sensors,
}: {
  parent: CategoryWithChildren
  isExpanded: boolean
  onToggle: () => void
  onEdit: (c: Category) => void
  onDelete: (c: Category) => void
  onAddChild: (parentId: string) => void
  onChildDragEnd: (parentId: string, event: DragEndEvent) => void
  sensors: ReturnType<typeof useSensors>
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: parent.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
    position: "relative",
  }

  const hasChildren = parent.children.length > 0

  return (
    <div ref={setNodeRef} style={style}>
      {/* 대분류 행 */}
      <div className="flex items-center gap-2 px-4 py-3 bg-background">
        <button
          type="button"
          className="shrink-0 p-1 -ml-1 cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground"
          aria-label="드래그하여 순서 변경"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <button
          type="button"
          onClick={onToggle}
          className="shrink-0 p-0.5 rounded hover:bg-muted transition-colors"
          aria-label={isExpanded ? "접기" : "펼치기"}
        >
          <ChevronRight
            className={`size-4 text-muted-foreground transition-transform ${
              isExpanded ? "rotate-90" : ""
            }`}
          />
        </button>
        {parent.icon && (
          <span className="text-lg shrink-0">{parent.icon}</span>
        )}
        <span className="flex-1 font-semibold truncate">{parent.name}</span>
        {parent.color && (
          <span
            className="size-4 rounded-full shrink-0 ring-1 ring-border"
            style={{ backgroundColor: parent.color }}
            aria-label={`색상: ${parent.color}`}
          />
        )}
        {hasChildren && (
          <Badge variant="secondary" className="shrink-0 text-xs">
            {parent.children.length}
          </Badge>
        )}
        <div className="flex gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onAddChild(parent.id)}
            aria-label={`${parent.name}에 소분류 추가`}
          >
            <FolderPlus className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onEdit(parent)}
            aria-label={`${parent.name} 수정`}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onDelete(parent)}
            aria-label={`${parent.name} 삭제`}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* 소분류 목록 */}
      {isExpanded && parent.children.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(e) => onChildDragEnd(parent.id, e)}
        >
          <SortableContext
            items={parent.children.map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="bg-muted/30">
              {parent.children.map((child) => (
                <SortableChildRow
                  key={child.id}
                  child={child}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* 소분류 없을 때 펼침 */}
      {isExpanded && parent.children.length === 0 && (
        <div className="bg-muted/30 border-t border-border/50 px-12 py-3">
          <p className="text-sm text-muted-foreground">
            소분류가 없습니다.{" "}
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => onAddChild(parent.id)}
            >
              추가하기
            </button>
          </p>
        </div>
      )}
    </div>
  )
}

function SortableChildRow({
  child,
  onEdit,
  onDelete,
}: {
  child: Category
  onEdit: (c: Category) => void
  onDelete: (c: Category) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: child.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
    position: "relative",
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 pl-10 pr-4 py-2.5 border-t border-border/50 bg-muted/30"
    >
      <button
        type="button"
        className="shrink-0 p-1 -ml-1 cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground"
        aria-label="드래그하여 순서 변경"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </button>
      {child.icon && <span className="text-base shrink-0">{child.icon}</span>}
      <span className="flex-1 text-sm truncate">{child.name}</span>
      {child.color && (
        <span
          className="size-3.5 rounded-full shrink-0 ring-1 ring-border"
          style={{ backgroundColor: child.color }}
          aria-label={`색상: ${child.color}`}
        />
      )}
      <div className="flex gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onEdit(child)}
          aria-label={`${child.name} 수정`}
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onDelete(child)}
          aria-label={`${child.name} 삭제`}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
