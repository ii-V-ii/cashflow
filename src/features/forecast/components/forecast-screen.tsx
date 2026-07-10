"use client"

import { PlayIcon, PlusIcon, Trash2Icon } from "lucide-react"
import dynamic from "next/dynamic"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import {
  useForecastMutations,
  useForecastResults,
  useForecastScenarios,
} from "@/features/forecast/hooks/use-forecast"
import { findGoalReachYm } from "@/lib/forecast/asset-forecast"
import { cn } from "@/lib/utils"
import { useToastStore } from "@/stores/toast-store"
import type { ForecastScenarioDto } from "@/types/api"

import { ScenarioEditorSheet } from "./scenario-editor-sheet"

// recharts lazy 로드 — 초기 번들에서 제외 (performance.md)
const ForecastCharts = dynamic(() => import("./forecast-charts"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="h-56 animate-pulse rounded-xl bg-surface-sunken" />
      <div className="h-56 animate-pulse rounded-xl bg-surface-sunken" />
    </div>
  ),
})

function formatAssumptions(scenario: ForecastScenarioDto): string {
  const parts: string[] = []
  const { assumptions } = scenario
  if (assumptions?.incomeGrowthRate !== undefined)
    parts.push(`수입 +${assumptions.incomeGrowthRate}%`)
  if (assumptions?.expenseGrowthRate !== undefined)
    parts.push(`지출 +${assumptions.expenseGrowthRate}%`)
  return parts.length > 0 ? parts.join(" · ") : "기본 가정"
}

/** 예측 화면 — 시나리오 카드 + 실행 + 차트 + 목표 도달 배지 (PRD §3.9) */
export function ForecastScreen() {
  const { data: scenarios = [], isPending } = useForecastScenarios()
  const { create, remove, run } = useForecastMutations()
  const showToast = useToastStore((state) => state.show)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [deleting, setDeleting] = useState<ForecastScenarioDto | null>(null)
  const [goalInput, setGoalInput] = useState("")

  const activeId = selectedId ?? scenarios[0]?.id ?? null
  const { data: results = [], isPending: isResultsPending } =
    useForecastResults(activeId)

  const goalAmount = goalInput ? Number(goalInput.replace(/\D/g, "")) : null
  const goalYm = useMemo(() => {
    if (!goalAmount) return null
    return findGoalReachYm(
      results.map((point) => ({
        ym: point.ym,
        projectedNetWorth: point.projectedNetWorth,
      })),
      goalAmount,
    )
  }, [results, goalAmount])

  function handleRun() {
    if (!activeId) return
    run.mutate(activeId)
  }

  function handleDelete() {
    if (!deleting) return
    remove.mutate(deleting.id, {
      onSuccess: () => {
        showToast("시나리오가 삭제되었습니다")
        if (selectedId === deleting.id) setSelectedId(null)
      },
    })
    setDeleting(null)
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 pt-6 pb-24">
      <header className="flex items-end justify-between px-1">
        <h1 className="text-lg font-semibold text-ink">예측</h1>
        {scenarios.length > 0 && (
          <Button
            onClick={() => setEditorOpen(true)}
            data-testid="add-scenario"
            className="h-11 bg-ink px-4 text-surface-raised hover:bg-ink/90"
          >
            <PlusIcon className="size-4" /> 새 시나리오
          </Button>
        )}
      </header>

      {isPending ? (
        <div className="flex flex-col gap-2" aria-hidden>
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="h-20 animate-pulse rounded-xl bg-surface-sunken" />
          ))}
        </div>
      ) : scenarios.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <p className="text-sm text-ink-muted">등록된 시나리오가 없습니다</p>
          <Button
            onClick={() => setEditorOpen(true)}
            data-testid="add-scenario-cta"
            className="h-11 bg-ink text-surface-raised"
          >
            새 시나리오 만들기
          </Button>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-2" aria-label="시나리오 목록">
            {scenarios.map((scenario) => {
              const isActive = scenario.id === activeId
              return (
                <li key={scenario.id} className="flex items-stretch gap-2">
                  <button
                    type="button"
                    data-testid="scenario-card"
                    aria-pressed={isActive}
                    onClick={() => setSelectedId(scenario.id)}
                    className={cn(
                      "flex min-h-[72px] min-w-0 flex-1 flex-col justify-center gap-0.5 rounded-xl px-4 py-3 text-left ring-1 transition-colors",
                      isActive
                        ? "bg-ink text-surface-raised ring-ink"
                        : "bg-surface-raised text-ink ring-hairline hover:bg-surface-sunken",
                    )}
                  >
                    <span className="truncate text-sm font-semibold">
                      {scenario.name}
                    </span>
                    <span
                      className={cn(
                        "text-[11px]",
                        isActive ? "text-surface-raised/75" : "text-ink-muted",
                      )}
                    >
                      {scenario.startDate.slice(0, 7)} ~ {scenario.endDate.slice(0, 7)}{" "}
                      · {formatAssumptions(scenario)}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`${scenario.name} 삭제`}
                    onClick={() => setDeleting(scenario)}
                    className="flex w-11 items-center justify-center rounded-xl text-ink-muted ring-1 ring-hairline transition-colors hover:bg-surface-sunken hover:text-loss"
                  >
                    <Trash2Icon className="size-4" />
                  </button>
                </li>
              )
            })}
          </ul>

          <Button
            onClick={handleRun}
            disabled={run.isPending || !activeId}
            data-testid="run-forecast"
            className="h-12 bg-ink text-surface-raised hover:bg-ink/90"
          >
            <PlayIcon className="size-4" />
            {run.isPending ? "예측 실행 중…" : "예측 실행"}
          </Button>

          {isResultsPending || run.isPending ? (
            <div className="flex flex-col gap-6" aria-hidden>
              <div className="h-56 animate-pulse rounded-xl bg-surface-sunken" />
              <div className="h-56 animate-pulse rounded-xl bg-surface-sunken" />
            </div>
          ) : results.length === 0 ? (
            <p className="rounded-xl bg-surface-sunken px-4 py-8 text-center text-sm text-ink-muted">
              아직 결과가 없습니다. 예측을 실행해 결과를 확인하세요.
            </p>
          ) : (
            <>
              <label className="flex flex-col gap-1.5 px-1 text-xs font-medium text-ink-muted">
                목표 금액 (도달 시점 표시)
                <Input
                  inputMode="numeric"
                  placeholder="예: 100000000"
                  value={goalInput}
                  data-testid="goal-input"
                  onChange={(event) =>
                    setGoalInput(event.target.value.replace(/\D/g, ""))
                  }
                  className="amount h-11 text-right"
                />
              </label>
              <ForecastCharts
                results={results}
                goalAmount={goalAmount}
                goalYm={goalYm}
              />
            </>
          )}
        </>
      )}

      <ScenarioEditorSheet
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onSubmit={(input) =>
          create.mutate(input, {
            onSuccess: () => {
              showToast("시나리오가 추가되었습니다")
              setEditorOpen(false)
            },
          })
        }
        isPending={create.isPending}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="시나리오를 삭제할까요?"
        description={
          deleting ? `'${deleting.name}' 시나리오와 저장된 결과가 삭제됩니다.` : ""
        }
        onConfirm={handleDelete}
        isPending={remove.isPending}
      />
    </main>
  )
}
