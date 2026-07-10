import { apiFetch } from "@/lib/api/http"
import type {
  CreateAssetCategoryInput,
  CreateAssetInput,
  CreateValuationInput,
  UpdateAssetCategoryInput,
  UpdateAssetInput,
} from "@/lib/validators"
import type { AssetFilter } from "@/types"
import type {
  AssetCategoryDto,
  AssetDetailDto,
  AssetDto,
  PortfolioDto,
  ValuationDto,
} from "@/types/api"

function assetsQueryString(filter?: AssetFilter): string {
  const params = new URLSearchParams()
  if (filter?.kind) params.set("kind", filter.kind)
  if (filter?.activeOnly === false) params.set("activeOnly", "false")
  const query = params.toString()
  return query ? `?${query}` : ""
}

export function getAssets(filter?: AssetFilter): Promise<AssetDto[]> {
  return apiFetch(`/api/v1/assets${assetsQueryString(filter)}`)
}

export function getAssetDetail(id: string): Promise<AssetDetailDto> {
  return apiFetch(`/api/v1/assets/${id}`)
}

export function createAsset(input: CreateAssetInput): Promise<AssetDto> {
  return apiFetch("/api/v1/assets", { method: "POST", body: JSON.stringify(input) })
}

export function updateAsset(id: string, input: UpdateAssetInput): Promise<AssetDto> {
  return apiFetch(`/api/v1/assets/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  })
}

export function deleteAsset(id: string): Promise<{ id: string }> {
  return apiFetch(`/api/v1/assets/${id}`, { method: "DELETE" })
}

export function getPortfolio(): Promise<PortfolioDto> {
  return apiFetch("/api/v1/assets/portfolio")
}

export function getValuations(assetId: string): Promise<ValuationDto[]> {
  return apiFetch(`/api/v1/assets/${assetId}/valuations`)
}

export function createValuation(
  assetId: string,
  input: CreateValuationInput,
): Promise<ValuationDto> {
  return apiFetch(`/api/v1/assets/${assetId}/valuations`, {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function getAssetCategories(): Promise<AssetCategoryDto[]> {
  return apiFetch("/api/v1/asset-categories")
}

export function createAssetCategory(
  input: CreateAssetCategoryInput,
): Promise<AssetCategoryDto> {
  return apiFetch("/api/v1/asset-categories", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function updateAssetCategory(
  id: string,
  input: UpdateAssetCategoryInput,
): Promise<AssetCategoryDto> {
  return apiFetch(`/api/v1/asset-categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  })
}

export function deleteAssetCategory(id: string): Promise<{ id: string }> {
  return apiFetch(`/api/v1/asset-categories/${id}`, { method: "DELETE" })
}
