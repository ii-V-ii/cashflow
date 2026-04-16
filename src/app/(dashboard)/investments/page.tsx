"use client"

import { useState, useMemo, useCallback } from "react"
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, ChevronRight, ChevronLeft } from "lucide-react"
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
  useTickerSummaries,
  useAnnualTradeReport,
  useCreateTrade,
  useUpdateTrade,
  useDeleteTrade,
} from "@/hooks/use-investment-trades"
import { useAssets } from "@/hooks/use-assets"
import { useAccounts } from "@/hooks/use-accounts"
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
  const [tradePage, setTradePage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [editingTrade, setEditingTrade] = useState<InvestmentTrade | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<InvestmentTrade | null>(null)

  // 매매 기록 월 네비게이터
  const now = new Date()
  const [tradeYear, setTradeYear] = useState(now.getFullYear())
  const [tradeMonth, setTradeMonth] = useState(now.getMonth() + 1)

  const tradeFrom = `${tradeYear}-${String(tradeMonth).padStart(2, "0")}-01`
  const tradeToDate = tradeMonth === 12
    ? `${tradeYear + 1}-01-01`
    : `${tradeYear}-${String(tradeMonth + 1).padStart(2, "0")}-01`

  const handleTradePrevMonth = useCallback(() => {
    setTradePage(1)
    setTradeMonth((m) => {
      if (m === 1) {
        setTradeYear((y) => y - 1)
        return 12
      }
      return m - 1
    })
  }, [])

  const handleTradeNextMonth = useCallback(() => {
    setTradePage(1)
    setTradeMonth((m) => {
      if (m === 12) {
        setTradeYear((y) => y + 1)
        return 1
      }
      return m + 1
    })
  }, [])

  const { data: assets } = useAssets()
  const { data: accounts } = useAccounts()
  const TRADES_PER_PAGE = 20
  const { data: tradesResult, isLoading: tradesLoading } = useInvestmentTrades(
    filterAssetId || undefined,
    tradeFrom,
    tradeToDate,
    tradePage,
    TRADES_PER_PAGE,
  )
  const trades = tradesResult?.data
  const tradesMeta = tradesResult?.meta

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

  const sortedTrades = trades ?? []

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
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" size="icon-sm" onClick={handleTradePrevMonth} aria-label="이전 달">
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-24 text-center text-sm font-semibold">
              {tradeYear}년 {tradeMonth}월
            </span>
            <Button variant="outline" size="icon-sm" onClick={handleTradeNextMonth} aria-label="다음 달">
              <ChevronRight className="size-4" />
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Select
              value={filterAssetId}
              onValueChange={(v) => { setFilterAssetId(v === "all" || !v ? "" : v); setTradePage(1) }}
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

          {/* 페이지네이션 */}
          {tradesMeta && tradesMeta.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={tradePage <= 1}
                onClick={() => setTradePage((p) => p - 1)}
              >
                이전
              </Button>
              <span className="text-sm text-muted-foreground">
                {tradePage} / {tradesMeta.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={tradePage >= tradesMeta.totalPages}
                onClick={() => setTradePage((p) => p + 1)}
              >
                다음
              </Button>
            </div>
          )}
        </TabsContent>

        {/* 수익 요약 탭 */}
        <TabsContent value="summary" className="space-y-4 pt-2">
          <SummaryTab assets={activeAssets} assetMap={assetMap} accounts={accounts} />
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
  accounts: Array<{ id: string; assetId: string | null; type: string }> | undefined
}

function SummaryTab({ assets, accounts }: SummaryTabProps) {
  // 투자 계좌에 연결된 자산만 표시
  const investmentAssetIds = useMemo(() => {
    if (!accounts) return new Set<string>()
    return new Set(
      accounts
        .filter((a) => a.type === "investment" && a.assetId)
        .map((a) => a.assetId!),
    )
  }, [accounts])

  const investmentAssets = assets.filter((a) => investmentAssetIds.has(a.id))

  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)

  // 기간 네비게이터: "전체" / "월간" / "연간"
  const now = new Date()
  const [summaryMode, setSummaryMode] = useState<"all" | "month" | "year">("month")
  const [summaryYear, setSummaryYear] = useState(now.getFullYear())
  const [summaryMonth, setSummaryMonth] = useState(now.getMonth() + 1)

  const summaryFrom = useMemo(() => {
    if (summaryMode === "month")
      return `${summaryYear}-${String(summaryMonth).padStart(2, "0")}-01`
    if (summaryMode === "year")
      return `${summaryYear}-01-01`
    return undefined
  }, [summaryMode, summaryYear, summaryMonth])

  const summaryTo = useMemo(() => {
    if (summaryMode === "month")
      return summaryMonth === 12
        ? `${summaryYear + 1}-01-01`
        : `${summaryYear}-${String(summaryMonth + 1).padStart(2, "0")}-01`
    if (summaryMode === "year")
      return `${summaryYear + 1}-01-01`
    return undefined
  }, [summaryMode, summaryYear, summaryMonth])

  const handleSummaryPrev = useCallback(() => {
    if (summaryMode === "year") {
      setSummaryYear((y) => y - 1)
    } else {
      setSummaryMode("month")
      setSummaryMonth((m) => {
        if (m === 1) {
          setSummaryYear((y) => y - 1)
          return 12
        }
        return m - 1
      })
    }
  }, [summaryMode])

  const handleSummaryNext = useCallback(() => {
    if (summaryMode === "year") {
      setSummaryYear((y) => y + 1)
    } else {
      setSummaryMode("month")
      setSummaryMonth((m) => {
        if (m === 12) {
          setSummaryYear((y) => y + 1)
          return 1
        }
        return m + 1
      })
    }
  }, [summaryMode])

  if (investmentAssets.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        투자 계좌에 연결된 자산이 없습니다.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-1">
          {(["all", "month", "year"] as const).map((mode) => (
            <Button
              key={mode}
              variant={summaryMode === mode ? "default" : "outline"}
              size="sm"
              onClick={() => setSummaryMode(mode)}
            >
              {mode === "all" ? "전체" : mode === "month" ? "월간" : "연간"}
            </Button>
          ))}
        </div>
        {summaryMode !== "all" && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon-sm" onClick={handleSummaryPrev} aria-label="이전">
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-28 text-center text-sm font-semibold">
              {summaryMode === "year"
                ? `${summaryYear}년`
                : `${summaryYear}년 ${summaryMonth}월`}
            </span>
            <Button variant="outline" size="icon-sm" onClick={handleSummaryNext} aria-label="다음">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </div>

      {summaryMode === "year" && (
        <AnnualTradeTable year={summaryYear} />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {investmentAssets.map((asset) => (
          <AssetSummaryCard
            key={asset.id}
            assetId={asset.id}
            from={summaryFrom}
            to={summaryTo}
            isSelected={selectedAssetId === asset.id}
            onSelect={() => setSelectedAssetId(selectedAssetId === asset.id ? null : asset.id)}
          />
        ))}
      </div>

      {selectedAssetId && (
        <TickerDetail assetId={selectedAssetId} assetName={investmentAssets.find(a => a.id === selectedAssetId)?.name ?? ""} from={summaryFrom} to={summaryTo} />
      )}
    </div>
  )
}

function AssetSummaryCard({ assetId, from, to, isSelected, onSelect }: { assetId: string; from?: string; to?: string; isSelected: boolean; onSelect: () => void }) {
  const { data: summary, isLoading, error } = useInvestmentTradeSummary(assetId, from, to)

  if (isLoading) return <Skeleton className="h-48" />
  if (error || !summary) {
    return (
      <Card className="p-4">
        <p className="text-sm text-muted-foreground text-center">데이터를 불러올 수 없습니다</p>
      </Card>
    )
  }

  const isPositiveReturn = summary.totalReturn >= 0

  return (
    <Card
      className={`cursor-pointer transition-colors ${isSelected ? "ring-2 ring-primary" : "hover:bg-muted/50"}`}
      onClick={onSelect}
    >
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
          <SummaryRow label="평균매수단가" value={`${formatCurrency(summary.avgBuyPrice)}원`} />
          <SummaryRow label="총 매수액" value={`${formatCurrency(summary.totalBought)}원`} />
          <SummaryRow label="총 매도액" value={`${formatCurrency(summary.totalSold)}원`} />
          <SummaryRow label="배당수익" value={`${formatCurrency(summary.totalDividend)}원`} className="text-emerald-600" />
          <SummaryRow label="실현손익" value={`${formatCurrency(summary.realizedGain)}원`} className={summary.realizedGain >= 0 ? "text-emerald-600" : "text-rose-600"} />
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

// 종목별 상세
function TickerDetail({ assetId, assetName, from, to }: { assetId: string; assetName: string; from?: string; to?: string }) {
  const { data: tickerSummaries } = useTickerSummaries(assetId, from, to)
  const { data: tradesData } = useInvestmentTrades(assetId, from, to)
  const trades = tradesData?.data
  const [expandedTickers, setExpandedTickers] = useState<Set<string>>(new Set())

  const toggleTicker = useCallback((ticker: string) => {
    setExpandedTickers((prev) => {
      const next = new Set(prev)
      if (next.has(ticker)) next.delete(ticker)
      else next.add(ticker)
      return next
    })
  }, [])

  // 백엔드 ticker 요약 + 기간 내 거래 목록 매핑
  const tickerGroups = useMemo(() => {
    if (!tickerSummaries) return []

    const tradesByTicker = new Map<string, NonNullable<typeof trades>>()
    for (const t of trades ?? []) {
      const key = t.ticker || "(종목명 없음)"
      const list = tradesByTicker.get(key) ?? []
      list.push(t)
      tradesByTicker.set(key, list)
    }

    return tickerSummaries.map((s) => ({
      ticker: s.ticker,
      holdingQty: s.holdingQty,
      avgBuyPrice: s.avgBuyPrice,
      totalBuyAmount: s.totalBuyAmount,
      totalSellNet: s.totalSellNet,
      totalDividend: s.totalDividend,
      realizedGain: s.realizedGain,
      trades: tradesByTicker.get(s.ticker) ?? [],
    }))
  }, [tickerSummaries, trades])

  const [tickerTab, setTickerTab] = useState("holding")

  const holdingGroups = tickerGroups.filter((g) => g.holdingQty > 0)
  const soldGroups = tickerGroups.filter((g) => g.holdingQty <= 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{assetName} - 종목별 상세</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={tickerTab} onValueChange={setTickerTab}>
          <TabsList variant="line" className="w-full sm:w-auto">
            <TabsTrigger value="holding">보유 종목 ({holdingGroups.length})</TabsTrigger>
            <TabsTrigger value="sold">매도 완료 ({soldGroups.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="holding" className="mt-3 space-y-4">
            {holdingGroups.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">보유 중인 종목이 없습니다.</p>
            ) : holdingGroups.map((group) => {
          const isExpanded = expandedTickers.has(group.ticker)
          return (
          <div key={group.ticker} className="space-y-2">
            <button
              type="button"
              onClick={() => toggleTicker(group.ticker)}
              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 hover:bg-muted transition-colors"
            >
              <div className="flex items-center gap-2">
                <ChevronRight className={`size-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                <span className="font-semibold">{group.ticker}</span>
              </div>
              <span className={`text-sm font-mono ${group.realizedGain >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                실현손익 {formatCurrency(group.realizedGain)}원
              </span>
            </button>
            <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground pl-8">
              <span>보유 {formatQuantity(group.holdingQty)}주</span>
              <span>평단 {formatCurrency(group.avgBuyPrice)}원</span>
              <span>매수총액 {formatCurrency(group.totalBuyAmount)}원</span>
              <span>배당 {formatCurrency(group.totalDividend)}원</span>
            </div>
            {isExpanded && (
            <div className="overflow-x-auto pl-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">날짜</TableHead>
                    <TableHead className="text-xs">유형</TableHead>
                    <TableHead className="text-xs text-right">수량</TableHead>
                    <TableHead className="text-xs text-right">단가</TableHead>
                    <TableHead className="text-xs text-right">총액</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.trades.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-xs">{formatDate(t.date)}</TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${TRADE_TYPE_BADGE_VARIANT[t.tradeType]}`}>
                          {TRADE_TYPE_LABELS[t.tradeType]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono">{formatQuantity(t.quantity)}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{formatCurrency(t.unitPrice)}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{formatCurrency(t.totalAmount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            )}
          </div>
          )
        })}
          </TabsContent>
          <TabsContent value="sold" className="mt-3 space-y-4">
            {soldGroups.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">매도 완료된 종목이 없습니다.</p>
            ) : soldGroups.map((group) => {
              const isExpanded = expandedTickers.has(group.ticker)
              return (
              <div key={group.ticker} className="space-y-2">
                <button
                  type="button"
                  onClick={() => toggleTicker(group.ticker)}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <ChevronRight className={`size-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                    <span className="font-semibold">{group.ticker}</span>
                  </div>
                  <span className={`text-sm font-mono ${group.realizedGain >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    실현손익 {formatCurrency(group.realizedGain)}원
                  </span>
                </button>
                <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground pl-8">
                  <span>매수총액 {formatCurrency(group.totalBuyAmount)}원</span>
                  <span>매도총액 {formatCurrency(group.totalSellNet)}원</span>
                  <span>배당 {formatCurrency(group.totalDividend)}원</span>
                </div>
                {isExpanded && (
                <div className="overflow-x-auto pl-6">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">날짜</TableHead>
                        <TableHead className="text-xs">유형</TableHead>
                        <TableHead className="text-xs text-right">수량</TableHead>
                        <TableHead className="text-xs text-right">단가</TableHead>
                        <TableHead className="text-xs text-right">총액</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.trades.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="text-xs">{formatDate(t.date)}</TableCell>
                          <TableCell>
                            <Badge className={`text-[10px] ${TRADE_TYPE_BADGE_VARIANT[t.tradeType]}`}>
                              {TRADE_TYPE_LABELS[t.tradeType]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-right font-mono">{formatQuantity(t.quantity)}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{formatCurrency(t.unitPrice)}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{formatCurrency(t.totalAmount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                )}
              </div>
              )
            })}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

function AnnualTradeTable({ year }: { year: number }) {
  const { data: report, isLoading } = useAnnualTradeReport(year)

  if (isLoading) return <Skeleton className="h-64" />
  if (!report) return null

  const MONTH_LABELS = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"]

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{year}년 월별 투자 요약</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-16">월</TableHead>
                <TableHead className="text-right">매수</TableHead>
                <TableHead className="text-right">매도</TableHead>
                <TableHead className="text-right">배당</TableHead>
                <TableHead className="text-right">실현손익</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.months.map((m, i) => {
                const hasData = m.totalBought > 0 || m.totalSold > 0 || m.totalDividend > 0
                return (
                  <TableRow key={m.month} className={hasData ? "" : "text-muted-foreground"}>
                    <TableCell className="font-medium">{MONTH_LABELS[i]}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {hasData ? `${formatCurrency(m.totalBought)}` : "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {m.totalSold > 0 ? `${formatCurrency(m.totalSold)}` : "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-emerald-600">
                      {m.totalDividend > 0 ? `${formatCurrency(m.totalDividend)}` : "-"}
                    </TableCell>
                    <TableCell className={`text-right font-mono text-sm font-semibold ${m.realizedGain >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {hasData ? `${formatCurrency(m.realizedGain)}` : "-"}
                    </TableCell>
                  </TableRow>
                )
              })}
              <TableRow className="border-t-2 font-semibold">
                <TableCell>합계</TableCell>
                <TableCell className="text-right font-mono text-sm">{formatCurrency(report.totalBought)}</TableCell>
                <TableCell className="text-right font-mono text-sm">{formatCurrency(report.totalSold)}</TableCell>
                <TableCell className="text-right font-mono text-sm text-emerald-600">{formatCurrency(report.totalDividend)}</TableCell>
                <TableCell className={`text-right font-mono text-sm ${report.totalRealizedGain >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {formatCurrency(report.totalRealizedGain)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
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
