"use client"

import { useState, useCallback, useMemo } from "react"
import Link from "next/link"
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, Link2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  AssetFormDialog,
  ASSET_TYPE_LABELS,
  ASSET_CATEGORY_LABELS,
} from "@/components/assets/AssetFormDialog"
import { PortfolioDonut } from "@/components/assets/PortfolioDonut"
import { AssetCategoryManager } from "@/components/assets/AssetCategoryManager"
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog"
import {
  useAssets,
  useCreateAsset,
  useUpdateAsset,
  useDeleteAsset,
  usePortfolioSummary,
} from "@/hooks/use-assets"
import { useAccounts } from "@/hooks/use-accounts"
import { formatCurrency } from "@/lib/utils"
import type { Asset, AssetCategory } from "@/types"
import type { CreateAssetInput } from "@/lib/validators/asset"

export default function AssetsPage() {
  const { data: assets, isLoading } = useAssets()
  const { data: accounts } = useAccounts()
  const { data: portfolio } = usePortfolioSummary()

  const accountNameMap = useMemo(() => {
    if (!accounts) return new Map<string, string>()
    return new Map(accounts.map((a) => [a.id, a.name]))
  }, [accounts])
  const createMutation = useCreateAsset()
  const updateMutation = useUpdateAsset()
  const deleteMutation = useDeleteAsset()

  const [formOpen, setFormOpen] = useState(false)
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null)
  const [categoryTab, setCategoryTab] = useState<"all" | AssetCategory>("all")

  const filteredAssets = useMemo(() => {
    if (!assets) return []
    if (categoryTab === "all") return assets
    return assets.filter((a) => a.category === categoryTab)
  }, [assets, categoryTab])

  const totalValue = useMemo(
    () => (assets ?? []).reduce((sum, a) => sum + a.currentValue, 0),
    [assets],
  )

  const totalCost = useMemo(
    () => (assets ?? []).reduce((sum, a) => sum + a.acquisitionCost, 0),
    [assets],
  )

  const totalGain = totalValue - totalCost
  const totalReturnRate = totalCost > 0 ? (totalGain / totalCost) * 100 : 0

  const handleAdd = useCallback(() => {
    setEditingAsset(null)
    setFormOpen(true)
  }, [])

  const handleEdit = useCallback((asset: Asset) => {
    setEditingAsset(asset)
    setFormOpen(true)
  }, [])

  const handleFormSubmit = useCallback(
    (data: CreateAssetInput) => {
      if (editingAsset) {
        updateMutation.mutate(
          { id: editingAsset.id, data },
          { onSuccess: () => setFormOpen(false) },
        )
      } else {
        createMutation.mutate(data, {
          onSuccess: () => setFormOpen(false),
        })
      }
    },
    [editingAsset, createMutation, updateMutation],
  )

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteTarget) return
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    })
  }, [deleteTarget, deleteMutation])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">자산</h1>
        <div className="flex gap-2">
          <AssetCategoryManager />
          <Button size="sm" onClick={handleAdd}>
            <Plus className="size-4" data-icon="inline-start" />
            추가
          </Button>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              총 자산가치
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-7 w-32" />
            ) : (
              <p className="text-xl font-bold font-mono">
                {formatCurrency(totalValue)}
              </p>
            )}
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              총 취득원가
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-7 w-32" />
            ) : (
              <p className="text-xl font-bold font-mono">
                {formatCurrency(totalCost)}
              </p>
            )}
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              평가손익
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-7 w-32" />
            ) : (
              <div className="flex items-center gap-2">
                {totalGain >= 0 ? (
                  <TrendingUp className="size-4 text-emerald-600" />
                ) : (
                  <TrendingDown className="size-4 text-rose-600" />
                )}
                <p
                  className={`text-xl font-bold font-mono ${
                    totalGain >= 0 ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {formatCurrency(totalGain)}
                </p>
                <span
                  className={`text-sm ${
                    totalGain >= 0 ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  ({totalReturnRate >= 0 ? "+" : ""}
                  {totalReturnRate.toFixed(1)}%)
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* 포트폴리오 도넛 차트 */}
        <div className="lg:col-span-1">
          <PortfolioDonut />
        </div>

        {/* 자산 목록 */}
        <div className="lg:col-span-2 space-y-4">
          <Tabs
            value={categoryTab}
            onValueChange={(v) => setCategoryTab(v as typeof categoryTab)}
          >
            <TabsList>
              <TabsTrigger value="all">전체</TabsTrigger>
              <TabsTrigger value="financial">금융자산</TabsTrigger>
              <TabsTrigger value="non_financial">비금융자산</TabsTrigger>
            </TabsList>

            <TabsContent value={categoryTab} className="mt-4">
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-28 w-full rounded-xl" />
                  ))}
                </div>
              ) : filteredAssets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <p>자산이 없습니다.</p>
                  <Button variant="link" onClick={handleAdd} className="mt-2">
                    첫 자산을 추가하세요
                  </Button>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {filteredAssets.map((asset) => {
                    const gain = asset.currentValue - asset.acquisitionCost
                    const returnRate =
                      asset.acquisitionCost > 0
                        ? (gain / asset.acquisitionCost) * 100
                        : 0

                    return (
                      <Card key={asset.id} size="sm">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Link
                              href={`/assets/${asset.id}`}
                              className="truncate hover:underline"
                            >
                              {asset.name}
                            </Link>
                            <Badge variant="outline" className="ml-auto shrink-0">
                              {ASSET_TYPE_LABELS[asset.type]}
                            </Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">
                              현재가치
                            </span>
                            <span className="text-sm font-mono font-semibold">
                              {formatCurrency(asset.currentValue)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">
                              수익률
                            </span>
                            <span
                              className={`text-sm font-mono font-medium ${
                                gain >= 0
                                  ? "text-emerald-600"
                                  : "text-rose-600"
                              }`}
                            >
                              {gain >= 0 ? "+" : ""}
                              {returnRate.toFixed(1)}%
                            </span>
                          </div>
                          {asset.accountId && accountNameMap.get(asset.accountId) && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Link2 className="size-3" />
                              <span>{accountNameMap.get(asset.accountId)}</span>
                            </div>
                          )}
                          {asset.institution && (
                            <p className="text-xs text-muted-foreground">
                              {asset.institution}
                            </p>
                          )}
                          <div className="flex justify-end gap-1 pt-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handleEdit(asset)}
                              aria-label={`${asset.name} 수정`}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setDeleteTarget(asset)}
                              aria-label={`${asset.name} 삭제`}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <AssetFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        asset={editingAsset}
        onSubmit={handleFormSubmit}
        isPending={createMutation.isPending || updateMutation.isPending}
      />

      <DeleteConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="자산 삭제"
        description={`"${deleteTarget?.name}" 자산을 삭제하시겠습니까? 관련 평가 이력도 모두 삭제됩니다.`}
        onConfirm={handleDeleteConfirm}
        isPending={deleteMutation.isPending}
      />
    </div>
  )
}
