"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { Category, CategoryWithChildren } from "@/types"
import type { CreateCategoryInput, UpdateCategoryInput } from "@/lib/validators/category"
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api-client"

type ReorderItem = { id: string; sortOrder: number }

const CATEGORIES_KEY = ["categories-flat"] as const
const CATEGORIES_GROUPED_KEY = ["categories-grouped"] as const

export function useCategories() {
  return useQuery({
    queryKey: CATEGORIES_KEY,
    queryFn: () => apiGet<Category[]>("/api/categories"),
  })
}

export function useGroupedCategories() {
  return useQuery({
    queryKey: CATEGORIES_GROUPED_KEY,
    queryFn: () => apiGet<CategoryWithChildren[]>("/api/categories?grouped=true"),
  })
}

export function useCreateCategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateCategoryInput) =>
      apiPost<Category>("/api/categories", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY })
      queryClient.invalidateQueries({ queryKey: CATEGORIES_GROUPED_KEY })
    },
  })
}

export function useUpdateCategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCategoryInput }) =>
      apiPut<Category>(`/api/categories/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY })
      queryClient.invalidateQueries({ queryKey: CATEGORIES_GROUPED_KEY })
    },
  })
}

export function useDeleteCategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      apiDelete<{ deleted: boolean }>(`/api/categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY })
      queryClient.invalidateQueries({ queryKey: CATEGORIES_GROUPED_KEY })
    },
  })
}

export function useReorderCategories() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (items: ReorderItem[]) =>
      apiPost<{ updated: number }>("/api/categories/reorder", { items }),
    onMutate: async (items: ReorderItem[]) => {
      await queryClient.cancelQueries({ queryKey: CATEGORIES_GROUPED_KEY })
      const previous = queryClient.getQueryData<CategoryWithChildren[]>(
        CATEGORIES_GROUPED_KEY,
      )

      if (!previous) return { previous }

      const orderMap = new Map(items.map((i) => [i.id, i.sortOrder]))

      const next = previous.map((parent) => {
        const newParentOrder = orderMap.get(parent.id) ?? parent.sortOrder
        const newChildren = parent.children.map((child) => ({
          ...child,
          sortOrder: orderMap.get(child.id) ?? child.sortOrder,
        }))
        newChildren.sort((a, b) => a.sortOrder - b.sortOrder)
        return {
          ...parent,
          sortOrder: newParentOrder,
          children: newChildren,
        }
      })

      next.sort((a, b) => a.sortOrder - b.sortOrder)

      queryClient.setQueryData(CATEGORIES_GROUPED_KEY, next)
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(CATEGORIES_GROUPED_KEY, context.previous)
      }
    },
    onSuccess: () => {
      // Invalidate the flat list only (used by TransactionForm).
      // Use exact matching to avoid invalidating CATEGORIES_GROUPED_KEY,
      // which would cause a race between server refetch and optimistic update.
      queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY, exact: true })
    },
  })
}
