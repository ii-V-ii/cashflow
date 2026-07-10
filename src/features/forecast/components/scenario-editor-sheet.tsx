"use client"

import { useState } from "react"

import { BottomSheet } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { CreateForecastScenarioInput } from "@/features/forecast/api"

interface ScenarioFormState {
  name: string
  startDate: string
  endDate: string
  incomeGrowthRate: string
  expenseGrowthRate: string
}

function todayYmd(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}

function plusMonthsYmd(months: number): string {
  const date = new Date()
  date.setMonth(date.getMonth() + months)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function emptyForm(): ScenarioFormState {
  return {
    name: "",
    startDate: todayYmd(),
    endDate: plusMonthsYmd(12),
    incomeGrowthRate: "",
    expenseGrowthRate: "",
  }
}

/** 시나리오 생성 시트 — 이름·기간·가정(증가율) 입력 (API.md §13.2) */
export function ScenarioEditorSheet({
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: CreateForecastScenarioInput) => void
  isPending: boolean
}) {
  const [form, setForm] = useState<ScenarioFormState>(emptyForm)

  function set<K extends keyof ScenarioFormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const incomeGrowthRate = form.incomeGrowthRate
      ? Number(form.incomeGrowthRate)
      : undefined
    const expenseGrowthRate = form.expenseGrowthRate
      ? Number(form.expenseGrowthRate)
      : undefined
    const hasAssumptions =
      incomeGrowthRate !== undefined || expenseGrowthRate !== undefined

    onSubmit({
      name: form.name,
      startDate: form.startDate,
      endDate: form.endDate,
      assumptions: hasAssumptions ? { incomeGrowthRate, expenseGrowthRate } : null,
    })
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="새 시나리오">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
          이름
          <Input
            required
            value={form.name}
            data-testid="scenario-name-input"
            onChange={(event) => set("name", event.target.value)}
            placeholder="예: 기본 시나리오"
            className="h-11"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
            시작일
            <Input
              required
              type="date"
              value={form.startDate}
              data-testid="scenario-start-input"
              onChange={(event) => set("startDate", event.target.value)}
              className="h-11"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
            종료일
            <Input
              required
              type="date"
              value={form.endDate}
              data-testid="scenario-end-input"
              onChange={(event) => set("endDate", event.target.value)}
              className="h-11"
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
            수입 증가율 (연 %)
            <Input
              inputMode="decimal"
              value={form.incomeGrowthRate}
              data-testid="scenario-income-rate-input"
              onChange={(event) =>
                set("incomeGrowthRate", event.target.value.replace(/[^\d.-]/g, ""))
              }
              placeholder="0"
              className="amount h-11 text-right"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
            지출 변동율 (연 %)
            <Input
              inputMode="decimal"
              value={form.expenseGrowthRate}
              data-testid="scenario-expense-rate-input"
              onChange={(event) =>
                set("expenseGrowthRate", event.target.value.replace(/[^\d.-]/g, ""))
              }
              placeholder="0"
              className="amount h-11 text-right"
            />
          </label>
        </div>
        <Button
          type="submit"
          data-testid="save-scenario"
          disabled={isPending}
          className="h-12 bg-ink text-surface-raised hover:bg-ink/90"
        >
          저장
        </Button>
      </form>
    </BottomSheet>
  )
}
