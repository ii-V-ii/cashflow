"use client"

import { useMemo } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"
import type { BudgetItemWithActual, CategorySubtotal } from "@/types"

const COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
  "#14b8a6", "#e11d48",
]

interface BudgetComparisonProps {
  items: readonly BudgetItemWithActual[]
  actualCategories?: readonly CategorySubtotal[]
}

interface ParentGroup {
  name: string
  planned: number   // 소분류 합산 or 대분류 직접 (화면 표시용)
  actual: number    // 소분류 없을 때만 사용
  children: { name: string; planned: number; actual: number }[]
}

export function BudgetComparison({ items, actualCategories }: BudgetComparisonProps) {
  const groups = useMemo(() => {
    const expenseItems = items.filter((item) => item.categoryType === "expense")

    const parentItems = expenseItems.filter((i) => i.categoryParentId === null)
    const childItems = expenseItems.filter((i) => i.categoryParentId !== null)

    // 대분류별 그룹 생성 (예산 항목 기준)
    const parentMap = new Map<string, ParentGroup>()
    for (const item of parentItems) {
      parentMap.set(item.categoryId, {
        name: item.categoryName,
        planned: item.plannedAmount,
        actual: item.actualAmount,
        children: [],
      })
    }

    // 소분류를 대분류 그룹에 추가 (부모 예산 없으면 그룹 생성)
    for (const item of childItems) {
      const pid = item.categoryParentId!
      if (!parentMap.has(pid)) {
        // 대분류 예산 없음 → categoryParentName으로 그룹 생성
        parentMap.set(pid, {
          name: item.categoryParentName ?? pid,
          planned: 0,
          actual: 0,
          children: [],
        })
      }
      parentMap.get(pid)!.children.push({
        name: item.categoryName,
        planned: item.plannedAmount,
        actual: item.actualAmount,
      })
    }

    // 예산·실적 모두 없는 대분류는 그룹 키만 있고 자식이 없을 수 있으니
    // 예산 없는 실적 카테고리(settlement)를 추가
    const coveredParentIds = new Set([
      ...parentItems.map((i) => i.categoryId),
      ...childItems.map((i) => i.categoryParentId!),
    ])
    if (actualCategories) {
      for (const ac of actualCategories) {
        if (!coveredParentIds.has(ac.categoryId) && ac.amount > 0) {
          parentMap.set(ac.categoryId, {
            name: ac.categoryName,
            planned: 0,
            actual: ac.amount,
            children: [],
          })
        }
      }
    }

    // 소분류가 있는 그룹은 소분류 합산으로 예산 덮어쓰기
    // (대분류 + 소분류 동시 설정 시 이중 계산 방지)
    for (const group of parentMap.values()) {
      if (group.children.length > 0) {
        group.planned = group.children.reduce((s, c) => s + c.planned, 0)
      }
    }

    // 실제 지출 기준 내림차순 정렬
    return Array.from(parentMap.values()).sort((a, b) => {
      const aActual =
        a.children.length > 0
          ? a.children.reduce((s, c) => s + c.actual, 0)
          : a.actual
      const bActual =
        b.children.length > 0
          ? b.children.reduce((s, c) => s + c.actual, 0)
          : b.actual
      return bActual - aActual
    })
  }, [items, actualCategories])

  // 스택형 차트 데이터: 대분류별 행, 소분류별 스택
  const { chartData, allChildNames } = useMemo(() => {
    const allNames = new Set<string>()
    const data = groups.map((group) => {
      const row: Record<string, number | string> = { name: group.name }

      if (group.children.length > 0) {
        // 소분류만 스택으로 표시 (대분류 항목 별도 표시 안 함)
        for (const child of group.children) {
          row[child.name] = child.actual
          allNames.add(child.name)
        }
        row["예산"] = group.planned
      } else {
        // 소분류 없는 항목은 대분류 자체를 하나의 스택으로
        row[group.name] = group.actual
        allNames.add(group.name)
        row["예산"] = group.planned
      }
      return row
    })

    return { chartData: data, allChildNames: Array.from(allNames) }
  }, [groups])

  if (groups.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>예산 vs 실적</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            지출 예산 항목이 없습니다.
          </p>
        </CardContent>
      </Card>
    )
  }

  const chartHeight = Math.max(groups.length * 70, 200)

  return (
    <Card>
      <CardHeader>
        <CardTitle>예산 vs 실적 (지출)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ left: 10, right: 30, top: 5, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}만`}
              fontSize={12}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={70}
              tick={{ fontSize: 12 }}
            />
            <Tooltip
              formatter={(value, name) => [
                formatCurrency(Number(value)),
                String(name),
              ]}
            />
            <Bar
              dataKey="예산"
              fill="#94a3b8"
              radius={[0, 4, 4, 0]}
              barSize={16}
            />
            {allChildNames.map((name, i) => (
              <Bar
                key={name}
                dataKey={name}
                stackId="actual"
                fill={COLORS[i % COLORS.length]}
                radius={i === allChildNames.length - 1 ? [0, 4, 4, 0] : undefined}
                barSize={16}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>

        {/* 소진율 목록 */}
        <div className="space-y-1.5">
          {groups.map((group) => {
            const planned = group.planned
            const actual =
              group.children.length > 0
                ? group.children.reduce((s, c) => s + c.actual, 0)
                : group.actual
            const rate = planned > 0 ? Math.round((actual / planned) * 100) : 0
            const over = actual > planned

            return (
              <div
                key={group.name}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-muted-foreground">{group.name}</span>
                <span
                  className={
                    over
                      ? "font-medium text-rose-600"
                      : "font-medium text-emerald-600"
                  }
                >
                  {rate}% 소진
                </span>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
