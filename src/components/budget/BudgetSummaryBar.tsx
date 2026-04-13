"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Currency } from "@/components/shared/Currency"

interface BudgetSummaryBarProps {
  income: number
  expense: number
}

export function BudgetSummaryBar({ income, expense }: BudgetSummaryBarProps) {
  const net = income - expense

  return (
    <>
      {/* Mobile: compact 2-row */}
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
        <div className="rounded-lg border px-3 py-2 text-center">
          <div className="text-xs text-muted-foreground">순수익</div>
          <Currency amount={net} colorBySign className="text-sm font-semibold" />
        </div>
      </div>

      {/* Desktop: 3-column cards */}
      <div className="hidden sm:grid sm:grid-cols-3 sm:gap-3">
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
