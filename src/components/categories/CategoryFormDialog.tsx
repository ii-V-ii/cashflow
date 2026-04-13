"use client"

import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
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
  createCategorySchema,
  type CreateCategoryInput,
  type CreateCategoryFormInput,
} from "@/lib/validators/category"
import type { Category, CategoryType } from "@/types"

interface CategoryFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  category: Category | null
  defaultType: CategoryType
  parentId: string | null
  onSubmit: (data: CreateCategoryInput) => void
  isPending: boolean
}

export function CategoryFormDialog({
  open,
  onOpenChange,
  category,
  defaultType,
  parentId,
  onSubmit,
  isPending,
}: CategoryFormDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateCategoryFormInput, unknown, CreateCategoryInput>({
    resolver: zodResolver(createCategorySchema),
    defaultValues: {
      name: "",
      type: defaultType,
      icon: null,
      color: null,
      parentId: null,
    },
  })

  useEffect(() => {
    if (open) {
      reset(
        category
          ? {
              name: category.name,
              type: category.type,
              icon: category.icon,
              color: category.color,
              parentId: category.parentId,
            }
          : {
              name: "",
              type: defaultType,
              icon: null,
              color: null,
              parentId: parentId,
            },
      )
    }
  }, [open, category, defaultType, parentId, reset])

  const isEditing = category !== null
  const isSubcategory = parentId !== null || (category?.parentId ?? null) !== null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {isEditing
              ? isSubcategory
                ? "소분류 수정"
                : "대분류 수정"
              : isSubcategory
                ? "소분류 추가"
                : "대분류 추가"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="category-name" className="text-sm font-medium">
              이름
            </label>
            <Input
              id="category-name"
              placeholder="카테고리 이름"
              {...register("name")}
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <input type="hidden" {...register("type")} />
          <input type="hidden" {...register("parentId")} />

          <div className="flex flex-col gap-2">
            <label htmlFor="category-icon" className="text-sm font-medium">
              아이콘 (선택)
            </label>
            <Input
              id="category-icon"
              placeholder="예: 🍔, 💰"
              {...register("icon")}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="category-color" className="text-sm font-medium">
              색상 (선택)
            </label>
            <Input
              id="category-color"
              placeholder="예: #3B82F6"
              {...register("color")}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              취소
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? isEditing
                  ? "수정 중..."
                  : "추가 중..."
                : isEditing
                  ? "수정"
                  : "추가"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
