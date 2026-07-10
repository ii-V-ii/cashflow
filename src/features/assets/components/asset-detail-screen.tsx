"use client"

import { ArrowLeftIcon, PlusIcon } from "lucide-react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useState } from "react"

import { BottomSheet } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  useAssetDetail,
  useValuationMutations,
} from "@/features/assets/hooks/use-assets"
import { formatKrw, formatSignedKrw } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useToastStore } from "@/stores/toast-store"

const ValuationChart = dynamic(() => import("./valuation-chart"), {
  ssr: false,
  loading: () => <div className="h-52 animate-pulse rounded-xl bg-surface-sunken" />,
})

const VALUATION_SOURCE_LABELS: Record<string, string> = {
  manual: "수동",
  api: "API",
  estimate: "추정",
  auto: "자동",
}

/** 자산 상세 — 평가 이력 차트·수동 평가 입력·연결 계좌 (PRD §3.7 상세) */
export function AssetDetailScreen({ assetId }: { assetId: string }) {
  const { data: asset, isPending, isError } = useAssetDetail(assetId)
  const { create } = useValuationMutations(assetId)
  const showToast = useToastStore((state) => state.show)

  const [valuationOpen, setValuationOpen] = useState(false)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [value, setValue] = useState("")

  if (isPending) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-3 px-4 pt-6" aria-hidden>
        <div className="h-8 w-40 animate-pulse rounded-lg bg-surface-sunken" />
        <div className="h-52 animate-pulse rounded-xl bg-surface-sunken" />
        <div className="h-40 animate-pulse rounded-xl bg-surface-sunken" />
      </main>
    )
  }

  if (isError || !asset) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col items-center gap-3 px-4 py-20">
        <p className="text-sm text-ink-muted">자산을 찾을 수 없습니다</p>
        <Link href="/assets" className="text-sm font-medium text-ink underline">
          자산 목록으로 돌아가기
        </Link>
      </main>
    )
  }

  function handleAddValuation(event: React.FormEvent) {
    event.preventDefault()
    create.mutate(
      { date, value: Number(value.replace(/[^\d]/g, "") || "0"), source: "manual" },
      {
        onSuccess: () => {
          showToast("평가 이력이 기록되었습니다")
          setValuationOpen(false)
          setValue("")
        },
      },
    )
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pt-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/assets"
          className="flex w-fit items-center gap-1 text-xs text-ink-muted hover:text-ink"
        >
          <ArrowLeftIcon className="size-3.5" /> 자산 목록
        </Link>
        <div className="flex items-end justify-between">
          <div>
            <h1 className="flex items-center gap-1.5 text-sm font-medium text-ink">
              {asset.name}
              <span className="rounded-md bg-surface-sunken px-1.5 py-0.5 text-[11px] text-ink-muted">
                {asset.assetCategory.name}
              </span>
            </h1>
            <p className="amount text-[length:var(--text-amount-hero)] font-bold leading-tight text-ink">
              {formatKrw(asset.currentValue)}
            </p>
            <p
              className={cn(
                "text-xs",
                asset.gain > 0 ? "text-gain" : asset.gain < 0 ? "text-loss" : "text-ink-muted",
              )}
            >
              {formatSignedKrw(asset.gain)} ({asset.gainRate}%) · 취득원가{" "}
              {formatKrw(asset.acquisitionCost)}
            </p>
          </div>
          <Button
            onClick={() => setValuationOpen(true)}
            data-testid="add-valuation"
            className="h-11 bg-ink px-4 text-surface-raised hover:bg-ink/90"
          >
            <PlusIcon className="size-4" /> 평가 입력
          </Button>
        </div>
      </header>

      {asset.valuations.length > 0 ? (
        <section
          aria-label="평가 이력 차트"
          className="rounded-xl bg-surface-raised p-3 ring-1 ring-hairline"
        >
          <ValuationChart valuations={asset.valuations} />
        </section>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-surface-raised py-10 ring-1 ring-hairline">
          <p className="text-sm text-ink-muted">평가 이력이 없습니다</p>
          <p className="text-xs text-ink-muted">
            평가를 입력하면 시계열 차트가 표시됩니다. 자동 스냅샷은 매일 기록됩니다.
          </p>
        </div>
      )}

      {asset.linkedAccounts.length > 0 && (
        <section aria-labelledby="linked-accounts-heading" className="flex flex-col gap-2">
          <h2 id="linked-accounts-heading" className="px-1 text-xs font-medium text-ink-muted">
            연결 계좌
          </h2>
          <ul className="divide-y divide-hairline rounded-xl bg-surface-raised ring-1 ring-hairline">
            {asset.linkedAccounts.map((account) => (
              <li
                key={account.id}
                className="flex items-center justify-between px-3 py-[var(--space-row)]"
              >
                <span className="text-sm text-ink">{account.name}</span>
                <span className="amount text-sm font-semibold text-ink">
                  {formatKrw(account.balance)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="valuations-heading" className="flex flex-col gap-2 pb-8">
        <h2 id="valuations-heading" className="px-1 text-xs font-medium text-ink-muted">
          평가 이력
        </h2>
        {asset.valuations.length === 0 ? (
          <p className="px-1 text-sm text-ink-muted">아직 기록이 없습니다</p>
        ) : (
          <ul className="divide-y divide-hairline rounded-xl bg-surface-raised ring-1 ring-hairline">
            {[...asset.valuations].reverse().map((valuation) => (
              <li
                key={valuation.id}
                className="flex items-center justify-between px-3 py-2"
                data-testid="valuation-row"
              >
                <span className="flex items-center gap-1.5 text-sm text-ink">
                  {valuation.date}
                  <span className="rounded-md bg-surface-sunken px-1.5 py-0.5 text-[10px] text-ink-muted">
                    {VALUATION_SOURCE_LABELS[valuation.source] ?? valuation.source}
                  </span>
                </span>
                <span className="amount text-sm font-semibold text-ink">
                  {formatKrw(valuation.value)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <BottomSheet
        open={valuationOpen}
        onOpenChange={setValuationOpen}
        title="평가 이력 입력"
      >
        <form onSubmit={handleAddValuation} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
            날짜 (같은 날짜는 덮어쓰기)
            <Input
              type="date"
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="h-11"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
            평가액
            <Input
              required
              inputMode="numeric"
              value={value}
              data-testid="valuation-value-input"
              onChange={(event) => setValue(event.target.value.replace(/[^\d]/g, ""))}
              className="amount h-11 text-right"
            />
          </label>
          <Button
            type="submit"
            data-testid="save-valuation"
            className="h-12 bg-ink text-surface-raised hover:bg-ink/90"
            disabled={create.isPending}
          >
            저장
          </Button>
        </form>
      </BottomSheet>
    </main>
  )
}
