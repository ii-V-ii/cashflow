"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useCallback } from "react"

import { AnnualGridView } from "@/features/budgets/components/annual-grid-view"
import { AnnualOverview } from "@/features/budgets/components/annual-overview"
import { MonthlyBudget } from "@/features/budgets/components/monthly-budget"
import { cn } from "@/lib/utils"

const TABS = [
  { value: "monthly", label: "월별" },
  { value: "grid", label: "연간 그리드" },
  { value: "overview", label: "연간 개요" },
] as const

type BudgetTab = (typeof TABS)[number]["value"]

function currentYm(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

/** 예산 화면 — 탭·기간 상태는 URL에 유지 (PRD §3.5, UI.md §5 예산) */
export function BudgetsScreen() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const tabParam = searchParams.get("tab")
  const tab: BudgetTab = TABS.some((item) => item.value === tabParam)
    ? (tabParam as BudgetTab)
    : "monthly"
  const ym = searchParams.get("ym") ?? currentYm()
  const year = Number(searchParams.get("year") ?? ym.slice(0, 4))

  const setParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) params.delete(key)
        else params.set(key, value)
      }
      router.replace(`/budgets?${params.toString()}`)
    },
    [router, searchParams],
  )

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 pt-4 pb-24">
      <header className="flex flex-col gap-3">
        <h1 className="text-lg font-semibold text-ink">예산</h1>
        <nav aria-label="예산 보기 전환" className="flex gap-1.5">
          {TABS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setParams({ tab: item.value })}
              aria-current={tab === item.value ? "page" : undefined}
              data-testid={`budget-tab-${item.value}`}
              className={cn(
                "min-h-11 rounded-full border px-4 text-sm font-medium transition-colors",
                tab === item.value
                  ? "border-ink bg-ink text-surface-raised"
                  : "border-hairline bg-surface-raised text-ink-muted hover:text-ink",
              )}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      {tab === "monthly" && (
        <MonthlyBudget key={ym} ym={ym} onYmChange={(next) => setParams({ ym: next })} />
      )}
      {tab === "grid" && (
        <AnnualGridView year={year} onYearChange={(next) => setParams({ year: String(next) })} />
      )}
      {tab === "overview" && (
        <AnnualOverview year={year} onYearChange={(next) => setParams({ year: String(next) })} />
      )}
    </main>
  )
}
