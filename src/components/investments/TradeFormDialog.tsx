"use client"

import { useEffect, useMemo } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import { z } from "zod"
import {
  createInvestmentTradeSchema,
  type CreateInvestmentTradeInput,
} from "@/lib/validators/investment-trade"
import { useAssets } from "@/hooks/use-assets"
import { useAccounts } from "@/hooks/use-accounts"
import { formatCurrency } from "@/lib/utils"
import type { InvestmentTrade, TradeType } from "@/types"

const TRADE_TYPE_LABELS: Record<TradeType, string> = {
  buy: "매수",
  sell: "매도",
  dividend: "배당",
}

const TRADE_TYPE_COLORS: Record<TradeType, string> = {
  buy: "bg-blue-600 text-white",
  sell: "bg-rose-600 text-white",
  dividend: "bg-emerald-600 text-white",
}

interface TradeFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  trade: InvestmentTrade | null
  onSubmit: (data: CreateInvestmentTradeInput) => void
  isPending: boolean
}

type FormValues = z.input<typeof createInvestmentTradeSchema>

export function TradeFormDialog({
  open,
  onOpenChange,
  trade,
  onSubmit,
  isPending,
}: TradeFormDialogProps) {
  const { data: assets } = useAssets()
  const { data: accounts } = useAccounts()

  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues, unknown, CreateInvestmentTradeInput>({
    resolver: zodResolver(createInvestmentTradeSchema),
    defaultValues: {
      assetId: "",
      tradeType: "buy",
      date: new Date().toISOString().slice(0, 10),
      ticker: null,
      quantity: 0,
      unitPrice: 0,
      totalAmount: 0,
      fee: 0,
      tax: 0,
      netAmount: 0,
      memo: null,
      accountId: null,
    },
  })

  useEffect(() => {
    if (open) {
      reset(
        trade
          ? {
              assetId: trade.assetId,
              tradeType: trade.tradeType,
              date: trade.date,
              ticker: trade.ticker,
              quantity: trade.quantity,
              unitPrice: trade.unitPrice,
              totalAmount: trade.totalAmount,
              fee: trade.fee,
              tax: trade.tax,
              netAmount: trade.netAmount,
              memo: trade.memo,
              accountId: trade.accountId,
            }
          : {
              assetId: "",
              tradeType: "buy",
              date: new Date().toISOString().slice(0, 10),
              ticker: null,
              quantity: 0,
              unitPrice: 0,
              totalAmount: 0,
              fee: 0,
              tax: 0,
              netAmount: 0,
              memo: null,
              accountId: null,
            },
      )
    }
  }, [open, trade, reset])

  const tradeType = watch("tradeType")
  const quantity = watch("quantity")
  const unitPrice = watch("unitPrice")
  const fee = watch("fee")
  const tax = watch("tax")

  // 총액 자동 계산
  useEffect(() => {
    const total = Math.round(quantity * unitPrice)
    setValue("totalAmount", total)

    if (tradeType === "buy") {
      setValue("netAmount", total + (fee || 0) + (tax || 0))
    } else {
      setValue("netAmount", total - (fee || 0) - (tax || 0))
    }
  }, [quantity, unitPrice, fee, tax, tradeType, setValue])

  const totalAmount = watch("totalAmount")
  const netAmount = watch("netAmount")

  const isEditing = trade !== null

  const activeAccounts = useMemo(
    () => accounts?.filter((a) => a.isActive) ?? [],
    [accounts],
  )

  const activeAssets = useMemo(
    () => assets?.filter((a) => a.isActive) ?? [],
    [assets],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "매매 기록 수정" : "매매 기록 등록"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {/* 자산 선택 */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">자산</label>
            <Controller
              name="assetId"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="자산 선택">
                      {(value: string) => {
                        const asset = activeAssets.find((a) => a.id === value)
                        return asset?.name ?? "자산 선택"
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {activeAssets.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.assetId && (
              <p className="text-xs text-destructive">
                {errors.assetId.message}
              </p>
            )}
          </div>

          {/* 매수/매도/배당 토글 */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">유형</label>
            <Controller
              name="tradeType"
              control={control}
              render={({ field }) => (
                <div className="grid grid-cols-3 gap-2">
                  {(["buy", "sell", "dividend"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => field.onChange(type)}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                        field.value === type
                          ? TRADE_TYPE_COLORS[type]
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      {TRADE_TYPE_LABELS[type]}
                    </button>
                  ))}
                </div>
              )}
            />
          </div>

          {/* 날짜 */}
          <div className="flex flex-col gap-2">
            <label htmlFor="trade-date" className="text-sm font-medium">
              날짜
            </label>
            <Input
              id="trade-date"
              type="date"
              {...register("date")}
              aria-invalid={!!errors.date}
            />
            {errors.date && (
              <p className="text-xs text-destructive">{errors.date.message}</p>
            )}
          </div>

          {/* 종목명 */}
          <div className="flex flex-col gap-2">
            <label htmlFor="trade-ticker" className="text-sm font-medium">
              종목명 (선택)
            </label>
            <Input
              id="trade-ticker"
              placeholder="예: 삼성전자"
              {...register("ticker")}
            />
          </div>

          {/* 수량 + 단가 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <label htmlFor="trade-quantity" className="text-sm font-medium">
                수량
              </label>
              <Input
                id="trade-quantity"
                type="number"
                step="0.0001"
                placeholder="0"
                {...register("quantity", { valueAsNumber: true })}
                aria-invalid={!!errors.quantity}
              />
              {errors.quantity && (
                <p className="text-xs text-destructive">
                  {errors.quantity.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="trade-unit-price" className="text-sm font-medium">
                단가 (원)
              </label>
              <Input
                id="trade-unit-price"
                type="number"
                placeholder="0"
                {...register("unitPrice", { valueAsNumber: true })}
                aria-invalid={!!errors.unitPrice}
              />
              {errors.unitPrice && (
                <p className="text-xs text-destructive">
                  {errors.unitPrice.message}
                </p>
              )}
            </div>
          </div>

          {/* 총액 (읽기전용) */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">총액</label>
            <div className="flex h-8 items-center rounded-lg border border-input bg-muted/50 px-2.5 text-sm font-mono">
              {formatCurrency(totalAmount)} 원
            </div>
          </div>

          {/* 수수료 + 세금 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <label htmlFor="trade-fee" className="text-sm font-medium">
                수수료 (원)
              </label>
              <Input
                id="trade-fee"
                type="number"
                placeholder="0"
                {...register("fee", { valueAsNumber: true })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="trade-tax" className="text-sm font-medium">
                세금 (원)
              </label>
              <Input
                id="trade-tax"
                type="number"
                placeholder="0"
                {...register("tax", { valueAsNumber: true })}
              />
            </div>
          </div>

          {/* 실수령액 (읽기전용) */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">
              {tradeType === "buy" ? "총 지출액" : "실수령액"}
            </label>
            <div className="flex h-8 items-center rounded-lg border border-input bg-muted/50 px-2.5 text-sm font-mono font-semibold">
              {formatCurrency(netAmount)} 원
            </div>
          </div>

          {/* 계좌 선택 */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">계좌 (선택)</label>
            <Controller
              name="accountId"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value ?? ""}
                  onValueChange={(v) => field.onChange(v || null)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="계좌 선택">
                      {(value: string) => {
                        if (!value) return "계좌 선택"
                        const account = activeAccounts.find(
                          (a) => a.id === value,
                        )
                        return account?.name ?? "계좌 선택"
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {activeAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {/* 메모 */}
          <div className="flex flex-col gap-2">
            <label htmlFor="trade-memo" className="text-sm font-medium">
              메모 (선택)
            </label>
            <Input
              id="trade-memo"
              placeholder="메모"
              {...register("memo")}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              취소
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? isEditing
                  ? "수정 중..."
                  : "등록 중..."
                : isEditing
                  ? "수정"
                  : "등록"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
