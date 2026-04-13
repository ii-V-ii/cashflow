"use client"

import { use, useCallback } from "react"
import Link from "next/link"
import { ArrowLeft, TrendingUp, TrendingDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ValuationChart } from "@/components/assets/ValuationChart"
import { ValuationForm } from "@/components/assets/ValuationForm"
import {
  ASSET_TYPE_LABELS,
  ASSET_CATEGORY_LABELS,
} from "@/components/assets/AssetFormDialog"
import { useAssetDetail, useCreateValuation } from "@/hooks/use-assets"
import { formatCurrency, formatDate } from "@/lib/utils"
import type { CreateValuationInput } from "@/lib/validators/asset"

interface AssetDetailPageProps {
  params: Promise<{ id: string }>
}

export default function AssetDetailPage({ params }: AssetDetailPageProps) {
  const { id } = use(params)
  const { data: asset, isLoading } = useAssetDetail(id)
  const createValuation = useCreateValuation()

  const handleValuationSubmit = useCallback(
    (data: CreateValuationInput) => {
      createValuation.mutate({ assetId: id, data })
    },
    [id, createValuation],
  )

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (!asset) {
    return (
      <div className="space-y-4">
        <Link href="/assets">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="size-4" data-icon="inline-start" />
            자산 목록
          </Button>
        </Link>
        <p className="text-muted-foreground">자산을 찾을 수 없습니다.</p>
      </div>
    )
  }

  const gain = asset.currentValue - asset.acquisitionCost
  const returnRate =
    asset.acquisitionCost > 0 ? (gain / asset.acquisitionCost) * 100 : 0

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Link href="/assets">
          <Button variant="ghost" size="icon-sm">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold truncate">{asset.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline">
              {ASSET_CATEGORY_LABELS[asset.category]}
            </Badge>
            <Badge variant="outline">{ASSET_TYPE_LABELS[asset.type]}</Badge>
            {asset.institution && (
              <span className="text-sm text-muted-foreground">
                {asset.institution}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 자산 정보 카드 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              현재가치
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold font-mono">
              {formatCurrency(asset.currentValue)}
            </p>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              취득원가
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold font-mono">
              {formatCurrency(asset.acquisitionCost)}
            </p>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              평가손익
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1.5">
              {gain >= 0 ? (
                <TrendingUp className="size-4 text-emerald-600" />
              ) : (
                <TrendingDown className="size-4 text-rose-600" />
              )}
              <p
                className={`text-lg font-bold font-mono ${
                  gain >= 0 ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {formatCurrency(gain)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              수익률
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-lg font-bold font-mono ${
                returnRate >= 0 ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {returnRate >= 0 ? "+" : ""}
              {returnRate.toFixed(2)}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 상세 정보 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">상세 정보</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">취득일</dt>
              <dd className="font-medium">
                {formatDate(asset.acquisitionDate, "yyyy.MM.dd")}
              </dd>
            </div>
            {asset.memo && (
              <div className="col-span-2">
                <dt className="text-muted-foreground">메모</dt>
                <dd className="font-medium">{asset.memo}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* 평가 이력 차트 */}
      <ValuationChart
        valuations={asset.valuations}
        acquisitionCost={asset.acquisitionCost}
      />

      {/* 평가 입력 폼 */}
      <ValuationForm
        onSubmit={handleValuationSubmit}
        isPending={createValuation.isPending}
      />
    </div>
  )
}
