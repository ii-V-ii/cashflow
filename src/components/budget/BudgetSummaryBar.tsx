"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Currency } from "@/components/shared/Currency"

interface BudgetSummaryBarProps {
  income: number
  expense: number
  consumption?: number
  saving?: number
}

export function BudgetSummaryBar({ income, expense, consumption, saving }: BudgetSummaryBarProps) {
  const net = income - expense
  const hasBreakdown = consumption !== undefined && saving !== undefined

  return (
    <>
      {/* Mobile: compact rows */}
      <div className="flex flex-col gap-2 sm:hidden">
        <div className="flex gap-2">
          <div className="flex-1 rounded-lg border px-3 py-2">
            <div className="text-xs text-muted-foreground">수입</div>
            <Currency amount={income} className="text-sm font-semibold text-emerald-600" />
          </div>
          <div className="flex-1 rounded-lg border px-3 py-2">
            <div className="text-xs text-muted-foreground">지출</div>
            <Currency amount={expense} className="text-sm font-semibold text-rose-600" />
          </div>
        </div>
        {hasBreakdown && (
          <div className="flex gap-2">
            <div className="flex-1 rounded-lg border px-3 py-2">
              <div className="text-xs text-muted-foreground">소비성</div>
              <Currency amount={consumption} className="text-sm font-semibold text-rose-600" />
            </div>
            <div className="flex-1 rounded-lg border px-3 py-2">
              <div className="text-xs text-muted-foreground">저축/투자</div>
              <Currency amount={saving} className="text-sm font-semibold text-amber-600" />
            </div>
          </div>
        )}
        <div className="rounded-lg border px-3 py-2 text-center">
          <div className="text-xs text-muted-foreground">순수익</div>
          <Currency amount={net} colorBySign className="text-sm font-semibold" />
        </div>
      </div>

      {/* Desktop: grid cards */}
      <div className="hidden sm:grid sm:gap-3" style={{ gridTemplateColumns: hasBreakdown ? "repeat(5, 1fr)" : "repeat(3, 1fr)" }}>
        <Card size="sm">
          <CardContent className="py-2">
            <div className="text-xs text-muted-foreground">수입 합계</div>
            <Currency amount={income} className="text-lg font-semibold text-emerald-600" />
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="py-2">
            <div className="text-xs text-muted-foreground">지출 합계</div>
            <Currency amount={expense} className="text-lg font-semibold text-rose-600" />
          </CardContent>
        </Card>
        {hasBreakdown && (
          <>
            <Card size="sm">
              <CardContent className="py-2">
                <div className="text-xs text-muted-foreground">소비성</div>
                <Currency amount={consumption} className="text-lg font-semibold text-rose-600" />
              </CardContent>
            </Card>
            <Card size="sm">
              <CardContent className="py-2">
                <div className="text-xs text-muted-foreground">저축/투자</div>
                <Currency amount={saving} className="text-lg font-semibold text-amber-600" />
              </CardContent>
            </Card>
          </>
        )}
        <Card size="sm">
          <CardContent className="py-2">
            <div className="text-xs text-muted-foreground">순수익</div>
            <Currency amount={net} colorBySign className="text-lg font-semibold" />
          </CardContent>
        </Card>
      </div>
    </>
  )
}
