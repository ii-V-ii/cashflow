"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { Save, Copy, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import {
  useBudgets,
  useBudgetDetail,
  useCreateBudget,
  useUpdateBudget,
  useCopyBudget,
} from "@/hooks/use-budget"
import { useGroupedCategories } from "@/hooks/use-categories"
import { formatCurrency } from "@/lib/utils"
import { BudgetComparison } from "@/components/budget/BudgetComparison"
import { AnnualOverview } from "@/components/budget/AnnualOverview"
import type { Category, CategoryWithChildren, BudgetWithItems } from "@/types"

export default function BudgetsPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [tab, setTab] = useState("monthly")

  const { data: budgets, isLoading: budgetsLoading } = useBudgets(year)
  const { data: grouped } = useGroupedCategories()
  // Flatten to get all leaf categories for budget item mapping
  const categories = useMemo(() => {
    if (!grouped) return undefined
    const all: Category[] = []
    for (const parent of grouped) {
      if (parent.children.length > 0) {
        all.push(...parent.children)
      } else {
        all.push(parent)
      }
    }
    return all
  }, [grouped])
  const currentBudget = budgets?.find((b) => b.month === month) ?? null
  const { data: budgetDetail, isLoading: detailLoading } = useBudgetDetail(
    currentBudget?.id ?? null,
  )

  const createBudget = useCreateBudget()
  const updateBudget = useUpdateBudget()
  const copyBudget = useCopyBudget()

  // categoryId → plannedAmount
  const [editItems, setEditItems] = useState<Map<string, number>>(new Map())
  const [isDirty, setIsDirty] = useState(false)

  // Sync from loaded budget detail
  useEffect(() => {
    if (!budgetDetail?.items || !categories) return
    const map = new Map<string, number>()
    for (const item of budgetDetail.items) {
      map.set(item.categoryId, item.plannedAmount)
    }
    for (const cat of categories) {
      if (!map.has(cat.id)) map.set(cat.id, 0)
    }
    setEditItems(map)
    setIsDirty(false)
  }, [budgetDetail, categories])

  // Init empty state when no budget exists
  useEffect(() => {
    if (budgetsLoading || currentBudget || !categories) return
    const map = new Map<string, number>()
    for (const cat of categories) {
      map.set(cat.id, 0)
    }
    setEditItems(map)
    setIsDirty(false)
  }, [budgetsLoading, currentBudget, categories])

  const incomeGroups = useMemo(
    () => grouped?.filter((c) => c.type === "income" && c.isActive) ?? [],
    [grouped],
  )
  const expenseGroups = useMemo(
    () => grouped?.filter((c) => c.type === "expense" && c.isActive) ?? [],
    [grouped],
  )
  const incomeLeaves = useMemo(
    () => categories?.filter((c) => c.type === "income" && c.isActive) ?? [],
    [categories],
  )
  const expenseLeaves = useMemo(
    () => categories?.filter((c) => c.type === "expense" && c.isActive) ?? [],
    [categories],
  )

  const totalIncome = useMemo(() => {
    let sum = 0
    for (const cat of incomeLeaves) sum += editItems.get(cat.id) ?? 0
    return sum
  }, [editItems, incomeLeaves])

  const totalExpense = useMemo(() => {
    let sum = 0
    for (const cat of expenseLeaves) sum += editItems.get(cat.id) ?? 0
    return sum
  }, [editItems, expenseLeaves])

  const handleAmountChange = useCallback(
    (categoryId: string, value: string) => {
      const amount = Math.max(0, parseInt(value, 10) || 0)
      setEditItems((prev) => {
        const next = new Map(prev)
        next.set(categoryId, amount)
        return next
      })
      setIsDirty(true)
    },
    [],
  )

  const handleSave = useCallback(() => {
    const items = Array.from(editItems.entries())
      .filter(([, amount]) => amount > 0)
      .map(([categoryId, plannedAmount]) => ({
        categoryId,
        plannedAmount,
        memo: null,
      }))

    if (currentBudget) {
      updateBudget.mutate(
        { id: currentBudget.id, data: { items, totalIncome, totalExpense } },
        { onSuccess: () => setIsDirty(false) },
      )
    } else {
      createBudget.mutate(
        {
          name: `${year}년 ${month}월 예산`,
          year,
          month,
          totalIncome,
          totalExpense,
          memo: null,
          items,
        },
        { onSuccess: () => setIsDirty(false) },
      )
    }
  }, [
    currentBudget,
    editItems,
    totalIncome,
    totalExpense,
    year,
    month,
    createBudget,
    updateBudget,
  ])

  const handleCopy = useCallback(() => {
    const sourceMonth = month === 1 ? 12 : month - 1
    const sourceYear = month === 1 ? year - 1 : year
    copyBudget.mutate({
      sourceYear,
      sourceMonth,
      targetYear: year,
      targetMonth: month,
    })
  }, [year, month, copyBudget])

  const handlePrevMonth = useCallback(() => {
    if (month === 1) {
      setYear((y) => y - 1)
      setMonth(12)
    } else {
      setMonth((m) => m - 1)
    }
  }, [month])

  const handleNextMonth = useCallback(() => {
    if (month === 12) {
      setYear((y) => y + 1)
      setMonth(1)
    } else {
      setMonth((m) => m + 1)
    }
  }, [month])

  const isSaving =
    createBudget.isPending || updateBudget.isPending || copyBudget.isPending

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">예산</h1>

      <Tabs value={tab} onValueChange={(v) => setTab(v as string)}>
        <TabsList>
          <TabsTrigger value="monthly">월별 예산</TabsTrigger>
          <TabsTrigger value="annual">연간 개요</TabsTrigger>
        </TabsList>

        <TabsContent value="monthly" className="mt-4 space-y-4">
          {/* 월 선택 + 액션 */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={handlePrevMonth}
              aria-label="이전 달"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-24 text-center text-sm font-semibold">
              {year}년 {month}월
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={handleNextMonth}
              aria-label="다음 달"
            >
              <ChevronRight className="size-4" />
            </Button>

            {currentBudget && (
              <Badge variant="outline" className="text-xs">
                등록됨
              </Badge>
            )}

            <div className="ml-auto flex items-center gap-2">
              {!currentBudget && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  disabled={isSaving}
                >
                  <Copy className="size-4" data-icon="inline-start" />
                  전월 복사
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!isDirty || isSaving}
              >
                <Save className="size-4" data-icon="inline-start" />
                {currentBudget ? "저장" : "생성"}
              </Button>
            </div>
          </div>

          {/* 예산 편집 */}
          {budgetsLoading || detailLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <BudgetCategorySection
                title="수입"
                groups={incomeGroups}
                editItems={editItems}
                budgetDetail={budgetDetail}
                onAmountChange={handleAmountChange}
                total={totalIncome}
                colorClass="text-emerald-600"
              />
              <BudgetCategorySection
                title="지출"
                groups={expenseGroups}
                editItems={editItems}
                budgetDetail={budgetDetail}
                onAmountChange={handleAmountChange}
                total={totalExpense}
                colorClass="text-rose-600"
              />

              <Card size="sm">
                <CardContent className="flex items-center justify-between py-2">
                  <span className="text-sm font-semibold">예산 순수익</span>
                  <span
                    className={`text-base font-mono font-semibold ${
                      totalIncome - totalExpense >= 0
                        ? "text-emerald-600"
                        : "text-rose-600"
                    }`}
                  >
                    {formatCurrency(totalIncome - totalExpense)}
                  </span>
                </CardContent>
              </Card>
            </div>
          )}

          {/* 비교 차트 */}
          {budgetDetail && budgetDetail.items.length > 0 && (
            <BudgetComparison items={budgetDetail.items} />
          )}
        </TabsContent>

        <TabsContent value="annual" className="mt-4">
          <div className="mb-4 flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => setYear((y) => y - 1)}
              aria-label="이전 연도"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-16 text-center text-sm font-semibold">
              {year}년
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => setYear((y) => y + 1)}
              aria-label="다음 연도"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <AnnualOverview year={year} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// --- Sub-component ---

interface BudgetCategorySectionProps {
  title: string
  groups: CategoryWithChildren[]
  editItems: Map<string, number>
  budgetDetail: BudgetWithItems | undefined
  onAmountChange: (categoryId: string, value: string) => void
  total: number
  colorClass: string
}

function BudgetCategorySection({
  title,
  groups,
  editItems,
  budgetDetail,
  onAmountChange,
  total,
  colorClass,
}: BudgetCategorySectionProps) {
  if (groups.length === 0) return null

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center justify-between">
          <span>{title}</span>
          <span className={`font-mono ${colorClass}`}>
            {formatCurrency(total)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {groups.map((parent) => {
            const leaves =
              parent.children.length > 0 ? parent.children : [parent]
            const groupTotal = leaves.reduce(
              (sum, c) => sum + (editItems.get(c.id) ?? 0),
              0,
            )

            return (
              <div key={parent.id}>
                {/* 대분류 헤더 */}
                <div className="flex items-center gap-3 px-4 py-2 bg-muted/40">
                  {parent.icon && (
                    <span className="shrink-0 text-base">{parent.icon}</span>
                  )}
                  <span className="flex-1 text-sm font-semibold">
                    {parent.name}
                  </span>
                  <span className="text-xs font-mono text-muted-foreground">
                    {formatCurrency(groupTotal)}
                  </span>
                </div>
                {/* 소분류 입력 */}
                {leaves.map((cat) => {
                  const amount = editItems.get(cat.id) ?? 0
                  const actual = budgetDetail?.items.find(
                    (i) => i.categoryId === cat.id,
                  )
                  const isChild = cat.id !== parent.id

                  return (
                    <div
                      key={cat.id}
                      className="flex items-center gap-3 px-4 py-2.5 pl-10"
                    >
                      {cat.icon && isChild && (
                        <span className="shrink-0 text-sm">{cat.icon}</span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {isChild ? cat.name : cat.name}
                      </span>
                      {actual && actual.actualAmount > 0 && (
                        <span className="shrink-0 text-xs font-mono text-muted-foreground">
                          실적 {formatCurrency(actual.actualAmount)}
                        </span>
                      )}
                      <Input
                        type="number"
                        min={0}
                        step={10000}
                        value={amount || ""}
                        onChange={(e) => onAmountChange(cat.id, e.target.value)}
                        placeholder="0"
                        className="h-8 w-28 shrink-0 text-right font-mono"
                      />
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
