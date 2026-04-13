"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { AssetCategoryCustom } from "@/types"
import type { CreateAssetCategoryInput, UpdateAssetCategoryInput } from "@/lib/validators/asset-category"
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api-client"

const ASSET_CATEGORIES_KEY = ["asset-categories"] as const

export function useAssetCategories() {
  return useQuery({
    queryKey: ASSET_CATEGORIES_KEY,
    queryFn: () => apiGet<AssetCategoryCustom[]>("/api/asset-categories"),
  })
}

export function useCreateAssetCategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateAssetCategoryInput) =>
      apiPost<AssetCategoryCustom>("/api/asset-categories", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ASSET_CATEGORIES_KEY })
    },
  })
}

export function useUpdateAssetCategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAssetCategoryInput }) =>
      apiPut<AssetCategoryCustom>(`/api/asset-categories/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ASSET_CATEGORIES_KEY })
    },
  })
}

export function useDeleteAssetCategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      apiDelete<{ deleted: boolean }>(`/api/asset-categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ASSET_CATEGORIES_KEY })
    },
  })
}
