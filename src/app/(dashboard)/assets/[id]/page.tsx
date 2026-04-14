"use client"

import { use, useCallback, useMemo } from "react"
import Link from "next/link"
import { ArrowLeft, TrendingUp, TrendingDown, Link2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ValuationChart } from "@/components/assets/ValuationChart"
import { ValuationForm } from "@/components/assets/ValuationForm"
import { useAssetDetail, useCreateValuation } from "@/hooks/use-assets"
import { useAssetCategories } from "@/hooks/use-asset-categories"
import { useAccounts } from "@/hooks/use-accounts"
import { formatCurrency, formatDate } from "@/lib/utils"
import type { CreateValuationInput } from "@/lib/validators/asset"

const SOURCE_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  manual: { label: "수동", variant: "outline" },
  auto: { label: "자동", variant: "secondary" },
  api: { label: "API", variant: "secondary" },
  estimate: { label: "추정", variant: "outline" },
}

interface AssetDetailPageProps {
  params: Promise<{ id: string }>
}

export default function AssetDetailPage({ params }: AssetDetailPageProps) {
  const { id } = use(params)
  const { data: asset, isLoading } = useAssetDetail(id)
  const { data: assetCategories } = useAssetCategories()
  const { data: accounts } = useAccounts()
  const createValuation = useCreateValuation()

  const linkedAccounts = useMemo(
    () => (accounts ?? []).filter((a) => a.assetId === id),
    [accounts, id],
  )

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
              {(() => {
                const cat = assetCategories?.find((c) => c.id === asset.assetCategoryId)
                if (!cat) return "미분류"
                return cat.icon ? `${cat.icon} ${cat.name}` : cat.name
              })()}
            </Badge>
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
            <div>
              <dt className="text-muted-foreground">연결 계좌</dt>
              <dd className="font-medium">
                {linkedAccounts.length > 0 ? (
                  <span className="inline-flex items-center gap-1">
                    <Link2 className="size-3 text-muted-foreground" />
                    {linkedAccounts.map(a => a.name).join(', ')}
                  </span>
                ) : (
                  <span className="text-muted-foreground">없음</span>
                )}
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

      {/* 평가 이력 테이블 */}
      {asset.valuations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">평가 이력 상세</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="pb-2 text-left font-medium">날짜</th>
                    <th className="pb-2 text-right font-medium">평가금액</th>
                    <th className="pb-2 text-center font-medium">구분</th>
                    <th className="pb-2 text-left font-medium">메모</th>
                  </tr>
                </thead>
                <tbody>
                  {[...asset.valuations]
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((v) => {
                      const sourceInfo = SOURCE_LABELS[v.source] ?? {
                        label: v.source,
                        variant: "outline" as const,
                      }
                      return (
                        <tr key={v.id} className="border-b last:border-0">
                          <td className="py-2 font-mono text-xs">
                            {formatDate(v.date, "yyyy.MM.dd")}
                          </td>
                          <td className="py-2 text-right font-mono font-medium">
                            {formatCurrency(v.value)}
                          </td>
                          <td className="py-2 text-center">
                            <Badge variant={sourceInfo.variant} className="text-xs">
                              {sourceInfo.label}
                            </Badge>
                          </td>
                          <td className="py-2 text-muted-foreground">
                            {v.memo ?? "-"}
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 평가 입력 폼 */}
      <ValuationForm
        onSubmit={handleValuationSubmit}
        isPending={createValuation.isPending}
      />
    </div>
  )
}
