"use client"

import { useState, useCallback, useMemo } from "react"
import { Plus, Play, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog"
import { ScenarioDialog } from "@/components/forecast/ScenarioDialog"
import dynamic from "next/dynamic"

const CashflowForecast = dynamic(
  () => import("@/components/forecast/CashflowForecast").then((m) => ({ default: m.CashflowForecast })),
  { ssr: false },
)
const AssetForecast = dynamic(
  () => import("@/components/forecast/AssetForecast").then((m) => ({ default: m.AssetForecast })),
  { ssr: false },
)
import {
  useForecastScenarios,
  useForecastResult,
  useCreateScenario,
  useDeleteScenario,
  useRunForecast,
} from "@/hooks/use-forecast"
import type { ForecastScenario } from "@/types"

export default function ForecastPage() {
  const { data: scenarios, isLoading: scenariosLoading } =
    useForecastScenarios()
  const createMutation = useCreateScenario()
  const deleteMutation = useDeleteScenario()
  const runMutation = useRunForecast()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [scenarioOpen, setScenarioOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [goalAmount, setGoalAmount] = useState<number>(0)

  const selectedScenario = scenarios?.find((s) => s.id === selectedId) ?? null

  const { data: forecastData, isLoading: forecastLoading } =
    useForecastResult(selectedId)

  const handleCreateScenario = useCallback(
    async (values: Record<string, unknown>) => {
      const result = await createMutation.mutateAsync(values)
      setSelectedId(result.id)
      setScenarioOpen(false)
    },
    [createMutation],
  )

  const forecastMonths = useMemo(() => {
    if (!selectedScenario) return 12
    const start = new Date(selectedScenario.startDate)
    const end = new Date(selectedScenario.endDate)
    return (
      (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth())
    ) || 12
  }, [selectedScenario])

  const handleRunForecast = useCallback(() => {
    if (selectedId) {
      runMutation.mutate({ scenarioId: selectedId, months: forecastMonths })
    }
  }, [selectedId, forecastMonths, runMutation])

  const handleConfirmDelete = useCallback(() => {
    if (deleteTarget) {
      deleteMutation.mutate(deleteTarget, {
        onSuccess: () => {
          if (selectedId === deleteTarget) {
            setSelectedId(null)
          }
          setDeleteTarget(null)
        },
      })
    }
  }, [deleteTarget, deleteMutation, selectedId])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">예측</h1>
        <Button onClick={() => setScenarioOpen(true)} size="sm">
          <Plus className="size-4" data-icon="inline-start" />
          새 시나리오
        </Button>
      </div>

      {/* 시나리오 선택 */}
      {scenariosLoading ? (
        <div className="flex gap-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-20 w-48" />
          ))}
        </div>
      ) : !scenarios || scenarios.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <p>등록된 시나리오가 없습니다.</p>
          <p className="text-sm">새 시나리오를 생성하여 예측을 시작하세요.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {scenarios.map((s) => (
              <ScenarioCard
                key={s.id}
                scenario={s}
                isSelected={selectedId === s.id}
                onSelect={() => setSelectedId(s.id)}
                onDelete={() => setDeleteTarget(s.id)}
              />
            ))}
          </div>

          {/* 선택된 시나리오의 예측 */}
          {selectedScenario && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleRunForecast}
                  size="sm"
                  disabled={runMutation.isPending}
                >
                  <Play className="size-4" data-icon="inline-start" />
                  {runMutation.isPending ? "예측 중..." : "예측 실행"}
                </Button>
                <div className="flex items-center gap-1.5 ml-auto">
                  <label className="text-xs text-muted-foreground whitespace-nowrap">
                    목표 금액
                  </label>
                  <Input
                    type="number"
                    placeholder="0"
                    className="w-36 h-8"
                    value={goalAmount || ""}
                    onChange={(e) =>
                      setGoalAmount(Number(e.target.value) || 0)
                    }
                  />
                </div>
              </div>

              <Tabs defaultValue="cashflow">
                <TabsList>
                  <TabsTrigger value="cashflow">현금흐름 예측</TabsTrigger>
                  <TabsTrigger value="assets">자산 예측</TabsTrigger>
                </TabsList>

                <TabsContent value="cashflow">
                  <CashflowForecast
                    data={forecastData}
                    isLoading={forecastLoading || runMutation.isPending}
                  />
                </TabsContent>

                <TabsContent value="assets">
                  <AssetForecast
                    data={forecastData}
                    isLoading={forecastLoading || runMutation.isPending}
                    goalAmount={goalAmount > 0 ? goalAmount : undefined}
                  />
                </TabsContent>
              </Tabs>
            </div>
          )}
        </>
      )}

      <ScenarioDialog
        open={scenarioOpen}
        onOpenChange={setScenarioOpen}
        onSubmit={handleCreateScenario}
        isPending={createMutation.isPending}
      />

      <DeleteConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="시나리오 삭제"
        description="이 시나리오와 관련 예측 결과가 모두 삭제됩니다."
        onConfirm={handleConfirmDelete}
        isPending={deleteMutation.isPending}
      />
    </div>
  )
}

interface ScenarioCardProps {
  scenario: ForecastScenario
  isSelected: boolean
  onSelect: () => void
  onDelete: () => void
}

function ScenarioCard({
  scenario,
  isSelected,
  onSelect,
  onDelete,
}: ScenarioCardProps) {
  const assumptions = scenario.assumptions

  return (
    <Card
      className={`cursor-pointer transition-colors min-w-44 ${
        isSelected
          ? "ring-2 ring-primary border-primary"
          : "hover:border-foreground/20"
      }`}
      onClick={onSelect}
    >
      <CardContent className="p-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="font-medium text-sm truncate">{scenario.name}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            aria-label="삭제"
          >
            <Trash2 className="size-3.5 text-muted-foreground" />
          </Button>
        </div>
        {assumptions && (
          <div className="flex flex-wrap gap-1">
            {assumptions.incomeGrowthRate !== undefined && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                수입 +{assumptions.incomeGrowthRate}%
              </Badge>
            )}
            {assumptions.expenseGrowthRate !== undefined && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                지출 +{assumptions.expenseGrowthRate}%
              </Badge>
            )}
            {assumptions.inflationRate !== undefined && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                인플레 {assumptions.inflationRate}%
              </Badge>
            )}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          {scenario.startDate.slice(0, 7)} ~ {scenario.endDate.slice(0, 7)}
        </p>
      </CardContent>
    </Card>
  )
}
