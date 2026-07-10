"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  createAsset,
  createAssetCategory,
  createValuation,
  deleteAsset,
  deleteAssetCategory,
  getAssetCategories,
  getAssetDetail,
  getAssets,
  getPortfolio,
  getValuations,
  updateAsset,
  updateAssetCategory,
} from "@/features/assets/api"
import { qk } from "@/lib/query-keys"
import type {
  CreateAssetCategoryInput,
  CreateAssetInput,
  CreateValuationInput,
  UpdateAssetCategoryInput,
  UpdateAssetInput,
} from "@/lib/validators"
import { useToastStore } from "@/stores/toast-store"
import type { AssetFilter } from "@/types"

const ASSETS_STALE_TIME_MS = 30_000

export function useAssets(filter?: AssetFilter) {
  return useQuery({
    queryKey: qk.assets.list(filter),
    queryFn: () => getAssets(filter),
    staleTime: ASSETS_STALE_TIME_MS,
  })
}

export function useAssetDetail(id: string) {
  return useQuery({
    queryKey: qk.assets.detail(id),
    queryFn: () => getAssetDetail(id),
    staleTime: ASSETS_STALE_TIME_MS,
  })
}

export function usePortfolio() {
  return useQuery({
    queryKey: qk.assets.portfolio(),
    queryFn: getPortfolio,
    staleTime: ASSETS_STALE_TIME_MS,
  })
}

export function useValuations(assetId: string) {
  return useQuery({
    queryKey: qk.assets.valuations(assetId),
    queryFn: () => getValuations(assetId),
    staleTime: ASSETS_STALE_TIME_MS,
  })
}

export function useAssetCategories() {
  return useQuery({
    queryKey: qk.assetCategories.list(),
    queryFn: getAssetCategories,
    staleTime: ASSETS_STALE_TIME_MS,
  })
}

/** 자산 CUD — assets.* 무효화 (ARCHITECTURE.md §6.3) */
export function useAssetMutations() {
  const queryClient = useQueryClient()
  const showToast = useToastStore((state) => state.show)

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: qk.assets.all })
    void queryClient.invalidateQueries({ queryKey: qk.dashboard.all })
  }
  const onError = (error: Error) => showToast(error.message, "error")

  const create = useMutation({
    mutationFn: (input: CreateAssetInput) => createAsset(input),
    onSuccess: invalidate,
    onError,
  })
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAssetInput }) =>
      updateAsset(id, input),
    onSuccess: invalidate,
    onError,
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteAsset(id),
    onSuccess: invalidate,
    onError,
  })

  return { create, update, remove }
}

/** 평가 이력 추가(동일 날짜 upsert) — 자산 상세·목록 동시 무효화 */
export function useValuationMutations(assetId: string) {
  const queryClient = useQueryClient()
  const showToast = useToastStore((state) => state.show)

  const create = useMutation({
    mutationFn: (input: CreateValuationInput) => createValuation(assetId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.assets.all })
    },
    onError: (error: Error) => showToast(error.message, "error"),
  })

  return { create }
}

/** 자산 카테고리 CUD — 카테고리·자산 목록 무효화 */
export function useAssetCategoryMutations() {
  const queryClient = useQueryClient()
  const showToast = useToastStore((state) => state.show)

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: qk.assetCategories.all })
    void queryClient.invalidateQueries({ queryKey: qk.assets.all })
  }
  const onError = (error: Error) => showToast(error.message, "error")

  const create = useMutation({
    mutationFn: (input: CreateAssetCategoryInput) => createAssetCategory(input),
    onSuccess: invalidate,
    onError,
  })
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAssetCategoryInput }) =>
      updateAssetCategory(id, input),
    onSuccess: invalidate,
    onError,
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteAssetCategory(id),
    onSuccess: invalidate,
    onError,
  })

  return { create, update, remove }
}
