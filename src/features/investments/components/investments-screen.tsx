"use client"

import { PlusIcon } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useAssets } from "@/features/assets/hooks/use-assets"
import { SummaryPanel } from "@/features/investments/components/summary-panel"
import { TradeFormSheet } from "@/features/investments/components/trade-form-sheet"
import {
  useTradeMutations,
  useTrades,
} from "@/features/investments/hooks/use-investments"
import { formatKrw, formatSignedKrw } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useToastStore } from "@/stores/toast-store"
import type { TradeDto, TradeType } from "@/types/api"

const TRADE_TYPE_META: Record<TradeType, { label: string; className: string }> = {
  buy: { label: "매수", className: "bg-surface-sunken text-ink" },
  sell: { label: "매도", className: "bg-loss/10 text-loss" },
  dividend: { label: "배당", className: "bg-gain/10 text-gain" },
}

type MainTab = "trades" | "summary"

/** 투자 화면 — 매매 기록 | 수익 요약 탭 (PRD §3.8) */
export function InvestmentsScreen() {
  const [tab, setTab] = useState<MainTab>("trades")
  const [assetFilter, setAssetFilter] = useState<string>("")
  const [page, setPage] = useState(1)
  const filter = useMemo(
    () => (assetFilter ? { assetId: assetFilter } : {}),
    [assetFilter],
  )
  const { data: assets = [] } = useAssets()
  const { data: trades, isPending } = useTrades(filter, page)
  const { remove } = useTradeMutations()
  const showToast = useToastStore((state) => state.show)

  const [formOpen, setFormOpen] = useState(false)
  const [deleting, setDeleting] = useState<TradeDto | null>(null)

  const totalPages = trades ? Math.max(1, Math.ceil(trades.total / trades.limit)) : 1

  function handleDelete() {
    if (!deleting) return
    remove.mutate(deleting.id, {
      onSuccess: () => showToast("매매 기록이 삭제되었습니다"),
    })
    setDeleting(null)
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pt-6">
      <header className="flex items-end justify-between px-1">
        <h1 className="text-lg font-semibold text-ink">투자</h1>
        <Button
          onClick={() => setFormOpen(true)}
          data-testid="add-trade"
          disabled={assets.length === 0}
          className="h-11 bg-ink px-4 text-surface-raised hover:bg-ink/90"
        >
          <PlusIcon className="size-4" /> 매매 등록
        </Button>
      </header>

      <div role="tablist" aria-label="투자 탭" className="flex gap-1 rounded-xl bg-surface-sunken p-1">
        {(
          [
            ["trades", "매매 기록"],
            ["summary", "수익 요약"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            data-testid={`investments-tab-${value}`}
            onClick={() => setTab(value)}
            className={cn(
              "h-9 flex-1 rounded-lg text-sm font-medium transition-colors",
              tab === value ? "bg-surface-raised text-ink shadow-sm" : "text-ink-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "summary" ? (
        <SummaryPanel />
      ) : assets.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <p className="text-sm text-ink-muted">투자 기록에 연결할 자산이 없습니다</p>
          <Link
            href="/assets"
            className="flex h-11 items-center rounded-xl bg-ink px-4 text-sm font-medium text-surface-raised"
          >
            자산 만들러 가기
          </Link>
        </div>
      ) : (
        <>
          <select
            value={assetFilter}
            aria-label="자산 필터"
            data-testid="trade-asset-filter"
            onChange={(event) => {
              setAssetFilter(event.target.value)
              setPage(1)
            }}
            className="h-10 w-fit rounded-lg border border-hairline bg-surface-raised px-2 text-sm text-ink"
          >
            <option value="">전체 자산</option>
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.name}
              </option>
            ))}
          </select>

          {isPending ? (
            <div className="flex flex-col gap-2" aria-hidden>
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-14 animate-pulse rounded-xl bg-surface-sunken" />
              ))}
            </div>
          ) : !trades || trades.items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16">
              <p className="text-sm text-ink-muted">매매 기록이 없습니다</p>
              <Button
                onClick={() => setFormOpen(true)}
                className="h-11 bg-ink text-surface-raised"
              >
                첫 매매 등록하기
              </Button>
            </div>
          ) : (
            <>
              <ul className="divide-y divide-hairline rounded-xl bg-surface-raised ring-1 ring-hairline">
                {trades.items.map((trade) => (
                  <li
                    key={trade.id}
                    className="flex items-center gap-2 px-3 py-[var(--space-row)]"
                    data-testid="trade-row"
                  >
                    <span
                      className={cn(
                        "rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                        TRADE_TYPE_META[trade.tradeType].className,
                      )}
                    >
                      {TRADE_TYPE_META[trade.tradeType].label}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-sm font-medium text-ink">
                        {trade.ticker ?? trade.asset.name}
                        {trade.ticker && (
                          <span className="ml-1.5 text-xs text-ink-muted">
                            {trade.asset.name}
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-ink-muted">
                        {trade.date}
                        {trade.tradeType !== "dividend" &&
                          ` · ${trade.quantity}주 × ${formatKrw(trade.unitPrice)}`}
                        {trade.tradeType === "buy" &&
                          trade.remainingQuantity !== null &&
                          trade.remainingQuantity < trade.quantity &&
                          ` · 잔여 ${trade.remainingQuantity}주`}
                      </span>
                    </span>
                    <span className="flex flex-col items-end gap-0.5">
                      <span className="amount text-sm font-semibold text-ink">
                        {formatKrw(
                          trade.tradeType === "buy" ? trade.totalAmount : trade.netAmount,
                        )}
                      </span>
                      {trade.tradeType === "sell" && trade.realizedGain !== null && (
                        <span
                          className={cn(
                            "text-[11px]",
                            trade.realizedGain > 0
                              ? "text-gain"
                              : trade.realizedGain < 0
                                ? "text-loss"
                                : "text-ink-muted",
                          )}
                        >
                          실현 {formatSignedKrw(trade.realizedGain)}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      aria-label="매매 기록 삭제"
                      onClick={() => setDeleting(trade)}
                      className="rounded-lg px-2 py-2 text-xs text-ink-muted hover:bg-surface-sunken hover:text-loss"
                    >
                      삭제
                    </button>
                  </li>
                ))}
              </ul>

              {totalPages > 1 && (
                <nav aria-label="페이지" className="flex items-center justify-center gap-3">
                  <Button
                    variant="outline"
                    className="h-9 px-3"
                    disabled={page <= 1}
                    onClick={() => setPage((current) => current - 1)}
                  >
                    이전
                  </Button>
                  <span className="text-xs text-ink-muted">
                    {page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    className="h-9 px-3"
                    disabled={page >= totalPages}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    다음
                  </Button>
                </nav>
              )}
            </>
          )}
        </>
      )}

      {assets.length > 0 && (
        <TradeFormSheet open={formOpen} onOpenChange={setFormOpen} assets={assets} />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="매매 기록을 삭제할까요?"
        description={
          deleting?.tradeType === "sell"
            ? "매도 기록을 삭제하면 차감된 매수 로트가 역FIFO로 복원됩니다."
            : deleting?.tradeType === "buy"
              ? "이미 매도에 매칭된 매수 기록은 삭제할 수 없습니다 (매도 먼저 삭제)."
              : "배당 기록을 삭제합니다."
        }
        onConfirm={handleDelete}
        isPending={remove.isPending}
      />
    </main>
  )
}
