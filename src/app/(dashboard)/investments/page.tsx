"use client"

import { useState, useMemo, useCallback } from "react"
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCurrency, formatDate } from "@/lib/utils"
import {
  useInvestmentTrades,
  useInvestmentTradeSummary,
  useCreateTrade,
  useUpdateTrade,
  useDeleteTrade,
} from "@/hooks/use-investment-trades"
import { useAssets } from "@/hooks/use-assets"
import { TradeFormDialog } from "@/components/investments/TradeFormDialog"
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog"
import type { InvestmentTrade, TradeType } from "@/types"
import type { CreateInvestmentTradeInput } from "@/lib/validators/investment-trade"

const TRADE_TYPE_LABELS: Record<TradeType, string> = {
  buy: "매수",
  sell: "매도",
  dividend: "배당",
}

const TRADE_TYPE_BADGE_VARIANT: Record<TradeType, string> = {
  buy: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  sell: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  dividend:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
}

export default function InvestmentsPage() {
  const [activeTab, setActiveTab] = useState("trades")
  const [filterAssetId, setFilterAssetId] = useState<string>("")
  const [formOpen, setFormOpen] = useState(false)
  const [editingTrade, setEditingTrade] = useState<InvestmentTrade | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<InvestmentTrade | null>(null)

  const { data: assets } = useAssets()
  const { data: trades, isLoading: tradesLoading } = useInvestmentTrades(
    filterAssetId || undefined,
  )

  const createMutation = useCreateTrade()
  const updateMutation = useUpdateTrade()
  const deleteMutation = useDeleteTrade()

  const activeAssets = useMemo(
    () => assets?.filter((a) => a.isActive) ?? [],
    [assets],
  )

  const assetMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const a of assets ?? []) {
      map.set(a.id, a.name)
    }
    return map
  }, [assets])

  const sortedTrades = useMemo(() => {
    if (!trades) return []
    return [...trades].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    )
  }, [trades])

  const handleOpenCreate = useCallback(() => {
    setEditingTrade(null)
    setFormOpen(true)
  }, [])

  const handleOpenEdit = useCallback((trade: InvestmentTrade) => {
    setEditingTrade(trade)
    setFormOpen(true)
  }, [])

  const handleFormSubmit = useCallback(
    async (data: CreateInvestmentTradeInput) => {
      if (editingTrade) {
        await updateMutation.mutateAsync({ id: editingTrade.id, data })
      } else {
        await createMutation.mutateAsync(data)
      }
      setFormOpen(false)
      setEditingTrade(null)
    },
    [editingTrade, updateMutation, createMutation],
  )

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    await deleteMutation.mutateAsync(deleteTarget.id)
    setDeleteTarget(null)
  }, [deleteTarget, deleteMutation])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">투자 수익률</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="trades">매매 기록</TabsTrigger>
          <TabsTrigger value="summary">수익 요약</TabsTrigger>
        </TabsList>

        {/* 매매 기록 탭 */}
        <TabsContent value="trades" className="space-y-4 pt-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Select
              value={filterAssetId}
              onValueChange={(v) => setFilterAssetId(v === "all" || !v ? "" : v)}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="전체 자산">
                  {(value: string) => {
                    if (!value || value === "all") return "전체 자산"
                    return assetMap.get(value) ?? "전체 자산"
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 자산</SelectItem>
                {activeAssets.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button onClick={handleOpenCreate}>
              <Plus className="size-4" data-icon="inline-start" />
              매매 등록
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              {tradesLoading ? (
                <div className="p-4">
                  <Skeleton className="h-48" />
                </div>
              ) : sortedTrades.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>날짜</TableHead>
                        <TableHead>종목</TableHead>
                        <TableHead>유형</TableHead>
                        <TableHead className="text-right">수량</TableHead>
                        <TableHead className="text-right">단가</TableHead>
                        <TableHead className="text-right">총액</TableHead>
                        <TableHead className="text-right">
                          수수료+세금
                        </TableHead>
                        <TableHead className="text-right sr-only sm:not-sr-only">
                          작업
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedTrades.map((trade) => (
                        <TableRow key={trade.id}>
                          <TableCell className="whitespace-nowrap text-sm">
                            {formatDate(trade.date)}
                          </TableCell>
                          <TableCell className="font-medium">
                            {trade.ticker ??
                              assetMap.get(trade.assetId) ??
                              "-"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={
                                TRADE_TYPE_BADGE_VARIANT[trade.tradeType]
                              }
                            >
                              {TRADE_TYPE_LABELS[trade.tradeType]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {trade.quantity % 1 === 0
                              ? trade.quantity
                              : trade.quantity.toFixed(4)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatCurrency(trade.unitPrice)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatCurrency(trade.totalAmount)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-muted-foreground">
                            {formatCurrency(trade.fee + trade.tax)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => handleOpenEdit(trade)}
                                aria-label="수정"
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => setDeleteTarget(trade)}
                                aria-label="삭제"
                              >
                                <Trash2 className="size-3.5 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  매매 기록이 없습니다. "매매 등록"으로 시작하세요.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 수익 요약 탭 */}
        <TabsContent value="summary" className="space-y-4 pt-2">
          <SummaryTab assets={activeAssets} assetMap={assetMap} />
        </TabsContent>
      </Tabs>

      {/* 매매 등록/수정 다이얼로그 */}
      <TradeFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        trade={editingTrade}
        onSubmit={handleFormSubmit}
        isPending={createMutation.isPending || updateMutation.isPending}
      />

      {/* 삭제 확인 다이얼로그 */}
      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="매매 기록 삭제"
        description="이 매매 기록을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다."
        onConfirm={handleDelete}
        isPending={deleteMutation.isPending}
      />
    </div>
  )
}

// ─── 수익 요약 탭 ───

interface SummaryTabProps {
  assets: Array<{ id: string; name: string }>
  assetMap: Map<string, string>
}

function SummaryTab({ assets }: SummaryTabProps) {
  if (assets.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        등록된 자산이 없습니다. 먼저 자산을 추가해주세요.
      </p>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {assets.map((asset) => (
        <AssetSummaryCard key={asset.id} assetId={asset.id} />
      ))}
    </div>
  )
}

function AssetSummaryCard({ assetId }: { assetId: string }) {
  const { data: summary, isLoading } = useInvestmentTradeSummary(assetId)

  if (isLoading) {
    return <Skeleton className="h-48" />
  }

  if (!summary) {
    return null
  }

  const isPositiveReturn = summary.totalReturn >= 0

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {summary.assetName}
          {isPositiveReturn ? (
            <TrendingUp className="size-4 text-emerald-600" />
          ) : (
            <TrendingDown className="size-4 text-rose-600" />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <SummaryRow label="보유수량" value={formatQuantity(summary.totalQuantity)} />
          <SummaryRow
            label="평균매수단가"
            value={`${formatCurrency(summary.avgBuyPrice)}원`}
          />
          <SummaryRow
            label="총 매수액"
            value={`${formatCurrency(summary.totalBought)}원`}
          />
          <SummaryRow
            label="총 매도액"
            value={`${formatCurrency(summary.totalSold)}원`}
          />
          <SummaryRow
            label="배당수익"
            value={`${formatCurrency(summary.totalDividend)}원`}
            className="text-emerald-600"
          />
          <SummaryRow
            label="실현손익"
            value={`${formatCurrency(summary.realizedGain)}원`}
            className={
              summary.realizedGain >= 0 ? "text-emerald-600" : "text-rose-600"
            }
          />
          <SummaryRow
            label="미실현손익"
            value={`${formatCurrency(summary.unrealizedGain)}원`}
            className={
              summary.unrealizedGain >= 0 ? "text-emerald-600" : "text-rose-600"
            }
          />
          <SummaryRow
            label="수익률"
            value={`${isPositiveReturn ? "+" : "-"}${Math.abs(summary.totalReturn).toFixed(2)}%`}
            className={`font-semibold ${isPositiveReturn ? "text-emerald-600" : "text-rose-600"}`}
          />
        </div>
      </CardContent>
    </Card>
  )
}

function SummaryRow({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-right font-mono ${className ?? ""}`}>{value}</span>
    </>
  )
}

function formatQuantity(qty: number): string {
  if (qty % 1 === 0) return String(qty)
  return qty.toFixed(4)
}
