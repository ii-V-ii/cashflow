"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  createCategory,
  deleteCategory,
  getCategories,
  reorderCategories,
  updateCategory,
} from "@/features/categories/api"
import { qk } from "@/lib/query-keys"
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
} from "@/lib/validators/category"
import { useToastStore } from "@/stores/toast-store"

const CATEGORIES_STALE_TIME_MS = 5 * 60 * 1000 // 변경 빈도 극히 낮음 (§6.2)

export function useCategories(type?: "income" | "expense") {
  return useQuery({
    queryKey: qk.categories.list(type),
    queryFn: () => getCategories(type),
    staleTime: CATEGORIES_STALE_TIME_MS,
  })
}

export function useCategoryMutations() {
  const queryClient = useQueryClient()
  const showToast = useToastStore((state) => state.show)

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: qk.categories.all })
  }
  const onError = (error: Error) => showToast(error.message, "error")

  const create = useMutation({
    mutationFn: (input: CreateCategoryInput) => createCategory(input),
    onSuccess: invalidate,
    onError,
  })
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCategoryInput }) =>
      updateCategory(id, input),
    onSuccess: invalidate,
    onError,
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: invalidate,
    onError,
  })
  const reorder = useMutation({
    mutationFn: (items: { id: string; sortOrder: number }[]) =>
      reorderCategories(items),
    onSuccess: invalidate,
    onError,
  })

  return { create, update, remove, reorder }
}
