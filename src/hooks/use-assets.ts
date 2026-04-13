"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type {
  Asset,
  AssetValuation,
  AssetWithValuations,
  PortfolioSummary,
} from "@/types"
import type {
  CreateAssetInput,
  UpdateAssetInput,
  CreateValuationInput,
} from "@/lib/validators/asset"
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api-client"

const ASSETS_KEY = ["assets"] as const

export function useAssets() {
  return useQuery({
    queryKey: ASSETS_KEY,
    queryFn: () => apiGet<Asset[]>("/api/assets"),
  })
}

export function useAssetDetail(id: string | null) {
  return useQuery({
    queryKey: [...ASSETS_KEY, id],
    queryFn: () => apiGet<AssetWithValuations>(`/api/assets/${id}`),
    enabled: !!id,
  })
}

export function usePortfolioSummary() {
  return useQuery({
    queryKey: [...ASSETS_KEY, "portfolio"],
    queryFn: () => apiGet<PortfolioSummary>("/api/assets/portfolio"),
  })
}

export function useCreateAsset() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateAssetInput) =>
      apiPost<Asset>("/api/assets", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ASSETS_KEY })
    },
  })
}

export function useUpdateAsset() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAssetInput }) =>
      apiPut<Asset>(`/api/assets/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ASSETS_KEY })
    },
  })
}

export function useDeleteAsset() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      apiDelete<{ deleted: boolean }>(`/api/assets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ASSETS_KEY })
    },
  })
}

export function useCreateValuation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      assetId,
      data,
    }: {
      assetId: string
      data: CreateValuationInput
    }) => apiPost<AssetValuation>(`/api/assets/${assetId}/valuations`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ASSETS_KEY })
    },
  })
}
