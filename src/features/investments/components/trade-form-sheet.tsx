"use client"

import { useState } from "react"

import { BottomSheet } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useTradeMutations } from "@/features/investments/hooks/use-investments"
import { useToastStore } from "@/stores/toast-store"
import type { AssetDto, TradeType } from "@/types/api"

const TRADE_TYPE_LABELS: Record<TradeType, string> = {
  buy: "매수",
  sell: "매도",
  dividend: "배당",
}

interface TradeFormState {
  assetId: string
  tradeType: TradeType
  date: string
  ticker: string
  quantity: string
  unitPrice: string
  fee: string
  tax: string
  memo: string
}

function emptyForm(assetId: string): TradeFormState {
  return {
    assetId,
    tradeType: "buy",
    date: new Date().toISOString().slice(0, 10),
    ticker: "",
    quantity: "",
    unitPrice: "",
    fee: "0",
    tax: "0",
    memo: "",
  }
}

function toInt(value: string): number {
  return Number(value.replace(/[^\d]/g, "") || "0")
}

/**
 * 매매 등록 시트 (PRD §3.8). 총액 = round(수량×단가),
 * 수령액(net) = 매수: 총액+수수료+세금 아님 — 도메인 규약:
 * buy: total_amount가 계좌에서 차감 / sell·dividend: net_amount(총액−수수료−세금)가 입금.
 */
export function TradeFormSheet({
  open,
  onOpenChange,
  assets,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  assets: AssetDto[]
}) {
  const { create } = useTradeMutations()
  const showToast = useToastStore((state) => state.show)
  const [form, setForm] = useState<TradeFormState>(() => emptyForm(assets[0]?.id ?? ""))

  const quantity = Number(form.quantity || "0")
  const unitPrice = toInt(form.unitPrice)
  const fee = toInt(form.fee)
  const tax = toInt(form.tax)
  const totalAmount =
    form.tradeType === "dividend" ? unitPrice : Math.round(quantity * unitPrice)
  const netAmount = Math.max(0, totalAmount - fee - tax)

  function set<K extends keyof TradeFormState>(key: K, value: TradeFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    create.mutate(
      {
        assetId: form.assetId,
        tradeType: form.tradeType,
        date: form.date,
        ticker: form.ticker || null,
        quantity: form.tradeType === "dividend" ? quantity || 1 : quantity,
        unitPrice,
        totalAmount,
        fee,
        tax,
        netAmount,
        memo: form.memo || null,
      },
      {
        onSuccess: () => {
          showToast(`${TRADE_TYPE_LABELS[form.tradeType]} 기록이 등록되었습니다`)
          onOpenChange(false)
          setForm(emptyForm(form.assetId))
        },
      },
    )
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="매매 기록 등록">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div
          role="radiogroup"
          aria-label="매매 유형"
          className="flex gap-1 rounded-xl bg-surface-sunken p-1"
        >
          {(Object.keys(TRADE_TYPE_LABELS) as TradeType[]).map((type) => (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={form.tradeType === type}
              data-testid={`trade-type-${type}`}
              onClick={() => set("tradeType", type)}
              className={
                form.tradeType === type
                  ? "h-9 flex-1 rounded-lg bg-surface-raised text-sm font-medium text-ink shadow-sm"
                  : "h-9 flex-1 rounded-lg text-sm font-medium text-ink-muted"
              }
            >
              {TRADE_TYPE_LABELS[type]}
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
          자산 (종목)
          <select
            required
            value={form.assetId}
            data-testid="trade-asset-select"
            onChange={(event) => set("assetId", event.target.value)}
            className="h-11 rounded-lg border border-hairline bg-surface-raised px-3 text-sm text-ink"
          >
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.name}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
            일자
            <Input
              type="date"
              required
              value={form.date}
              onChange={(event) => set("date", event.target.value)}
              className="h-11"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
            티커 (선택)
            <Input
              value={form.ticker}
              maxLength={20}
              placeholder="AAPL"
              data-testid="trade-ticker-input"
              onChange={(event) => set("ticker", event.target.value.toUpperCase())}
              className="h-11"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
            {form.tradeType === "dividend" ? "수량 (기록용)" : "수량"}
            <Input
              required={form.tradeType !== "dividend"}
              inputMode="decimal"
              value={form.quantity}
              data-testid="trade-quantity-input"
              onChange={(event) =>
                set("quantity", event.target.value.replace(/[^\d.]/g, ""))
              }
              className="amount h-11 text-right"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
            {form.tradeType === "dividend" ? "배당 총액" : "단가"}
            <Input
              required
              inputMode="numeric"
              value={form.unitPrice}
              data-testid="trade-unit-price-input"
              onChange={(event) =>
                set("unitPrice", event.target.value.replace(/[^\d]/g, ""))
              }
              className="amount h-11 text-right"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
            수수료
            <Input
              inputMode="numeric"
              value={form.fee}
              onChange={(event) => set("fee", event.target.value.replace(/[^\d]/g, ""))}
              className="amount h-11 text-right"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
            세금
            <Input
              inputMode="numeric"
              value={form.tax}
              onChange={(event) => set("tax", event.target.value.replace(/[^\d]/g, ""))}
              className="amount h-11 text-right"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
          메모 (선택)
          <Input
            value={form.memo}
            maxLength={500}
            onChange={(event) => set("memo", event.target.value)}
            className="h-11"
          />
        </label>

        <p className="px-1 text-xs text-ink-muted">
          총액 {new Intl.NumberFormat("ko-KR").format(totalAmount)}원 · 수령/지급 기준액{" "}
          {new Intl.NumberFormat("ko-KR").format(netAmount)}원
        </p>

        <Button
          type="submit"
          data-testid="save-trade"
          className="h-12 bg-ink text-surface-raised hover:bg-ink/90"
          disabled={create.isPending || form.assetId === ""}
        >
          {create.isPending ? "저장 중…" : "저장"}
        </Button>
      </form>
    </BottomSheet>
  )
}
