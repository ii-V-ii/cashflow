"use client"

import { useState, useMemo, useCallback } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import dynamic from "next/dynamic"

const TrendChart = dynamic(
  () => import("@/components/reports/TrendChart").then((m) => ({ default: m.TrendChart })),
  { ssr: false },
)
const CategoryDonut = dynamic(
  () => import("@/components/reports/CategoryDonut").then((m) => ({ default: m.CategoryDonut })),
  { ssr: false },
)
const NetWorthChart = dynamic(
  () => import("@/components/reports/NetWorthChart").then((m) => ({ default: m.NetWorthChart })),
  { ssr: false },
)

const PERIOD_OPTIONS = [
  { label: "최근 6개월", value: "6" },
  { label: "최근 12개월", value: "12" },
  { label: "최근 24개월", value: "24" },
]

export default function ReportsPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [period, setPeriod] = useState("12")

  const { from, to } = useMemo(() => {
    const months = Number(period)
    const toDate = new Date(year, month - 1)
    const fromDate = new Date(year, month - 1 - (months - 1))
    return {
      from: formatYM(fromDate.getFullYear(), fromDate.getMonth() + 1),
      to: formatYM(toDate.getFullYear(), toDate.getMonth() + 1),
    }
  }, [year, month, period])

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
      <h1 className="text-2xl font-semibold">보고서</h1>

      {/* 기간 선택 */}
      <div className="flex flex-wrap items-center gap-3">
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

        <Select value={period} onValueChange={(v) => { if (v) setPeriod(v) }}>
          <SelectTrigger className="w-36">
            <SelectValue>
              {(value: string) =>
                PERIOD_OPTIONS.find((opt) => opt.value === value)?.label ?? ""
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 수입/지출 추이 */}
      <TrendChart from={from} to={to} />

      {/* 카테고리별 지출 분석 */}
      <CategoryDonut year={year} month={month} />

      {/* 순자산 추이 */}
      <NetWorthChart months={Number(period)} />
    </div>
  )
}

function formatYM(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`
}
