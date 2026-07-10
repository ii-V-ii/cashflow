"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useCallback } from "react"

import { AnnualSettlementView } from "@/features/settlements/components/annual-settlement-view"
import { MonthlySettlementView } from "@/features/settlements/components/monthly-settlement-view"
import { cn } from "@/lib/utils"

const TABS = [
  { value: "monthly", label: "월별" },
  { value: "annual", label: "연간" },
] as const

type TabValue = (typeof TABS)[number]["value"]

function currentYm(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

/** 결산 화면 — 월별|연간 탭, 상태는 URL에 유지 (PRD §3.6, UI.md §5 결산) */
export function SettlementsScreen() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const tab: TabValue = searchParams.get("tab") === "annual" ? "annual" : "monthly"
  const ym = searchParams.get("ym") ?? currentYm()
  const year = Number(searchParams.get("year") ?? ym.slice(0, 4))

  const setParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) params.delete(key)
        else params.set(key, value)
      }
      router.replace(`/settlements?${params.toString()}`)
    },
    [router, searchParams],
  )

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pt-4">
      <div className="flex items-center justify-between px-1">
        <h1 className="text-lg font-semibold text-ink">결산</h1>
        <div
          role="tablist"
          aria-label="결산 기간"
          className="flex rounded-lg bg-surface-sunken p-0.5"
        >
          {TABS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setParams({ tab: value })}
              className={cn(
                "flex h-9 min-w-16 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors",
                tab === value
                  ? "bg-surface-raised text-ink shadow-sm"
                  : "text-ink-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "monthly" ? (
        <MonthlySettlementView ym={ym} onYmChange={(next) => setParams({ ym: next })} />
      ) : (
        <AnnualSettlementView
          year={year}
          onYearChange={(next) => setParams({ year: String(next) })}
        />
      )}
    </main>
  )
}
