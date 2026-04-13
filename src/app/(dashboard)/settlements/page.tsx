"use client"

import { useState, useCallback } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { MonthlySettlementView } from "@/components/settlements/MonthlySettlementView"
import { AnnualSettlementView } from "@/components/settlements/AnnualSettlementView"

export default function SettlementsPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [tab, setTab] = useState("monthly")

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

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">결산</h1>

      <Tabs value={tab} onValueChange={(v) => setTab(v as string)}>
        <TabsList>
          <TabsTrigger value="monthly">월별 결산</TabsTrigger>
          <TabsTrigger value="annual">연간 결산</TabsTrigger>
        </TabsList>

        <TabsContent value="monthly" className="mt-4 space-y-4">
          {/* 월 네비게이션 */}
          <div className="flex items-center gap-2">
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
          </div>

          <MonthlySettlementView year={year} month={month} />
        </TabsContent>

        <TabsContent value="annual" className="mt-4 space-y-4">
          {/* 연도 네비게이션 */}
          <div className="flex items-center gap-2">
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

          <AnnualSettlementView year={year} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
