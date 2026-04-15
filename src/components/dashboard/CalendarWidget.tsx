"use client"

import { useState, useMemo, useCallback } from "react"
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useDailyTotals } from "@/hooks/use-dashboard"
import { formatCurrency } from "@/lib/utils"

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"]

export function CalendarWidget() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const { data: dailyTotals, isLoading } = useDailyTotals(year, month)

  const handlePrev = useCallback(() => {
    setMonth((m) => {
      if (m === 1) {
        setYear((y) => y - 1)
        return 12
      }
      return m - 1
    })
  }, [])

  const handleNext = useCallback(() => {
    setMonth((m) => {
      if (m === 12) {
        setYear((y) => y + 1)
        return 1
      }
      return m + 1
    })
  }, [])

  // 날짜별 수입/지출 맵
  const totalsMap = useMemo(() => {
    const map = new Map<string, { income: number; expense: number }>()
    if (!dailyTotals) return map
    for (const d of dailyTotals) {
      map.set(d.date, { income: d.income, expense: d.expense })
    }
    return map
  }, [dailyTotals])

  // 캘린더 그리드 계산
  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1)
    const lastDay = new Date(year, month, 0)
    const startDayOfWeek = firstDay.getDay() // 0=일 ~ 6=토
    const daysInMonth = lastDay.getDate()

    const days: Array<{ day: number | null; dateStr: string | null }> = []

    // 앞쪽 빈칸
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push({ day: null, dateStr: null })
    }

    // 실제 날짜
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`
      days.push({ day: d, dateStr })
    }

    return days
  }, [year, month])

  const today = now.toISOString().slice(0, 10)

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4" />
            거래 캘린더
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon-sm" onClick={handlePrev} aria-label="이전 달">
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-24 text-center text-sm font-semibold">
              {year}년 {month}월
            </span>
            <Button variant="outline" size="icon-sm" onClick={handleNext} aria-label="다음 달">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-80" />
        ) : (
          <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
            {/* 요일 헤더 */}
            {WEEKDAYS.map((day, i) => (
              <div
                key={day}
                className={`bg-muted px-1 py-1.5 text-center text-xs font-medium ${i === 0 ? "text-rose-500" : i === 6 ? "text-blue-500" : "text-muted-foreground"}`}
              >
                {day}
              </div>
            ))}

            {/* 날짜 셀 */}
            {calendarDays.map((cell, idx) => {
              if (cell.day === null) {
                return <div key={`empty-${idx}`} className="bg-background min-h-16" />
              }

              const totals = cell.dateStr ? totalsMap.get(cell.dateStr) : null
              const isToday = cell.dateStr === today
              const dayOfWeek = (idx) % 7

              return (
                <div
                  key={cell.dateStr}
                  className={`bg-background min-h-16 p-1 ${isToday ? "ring-2 ring-inset ring-primary" : ""}`}
                >
                  <span className={`text-xs font-medium ${dayOfWeek === 0 ? "text-rose-500" : dayOfWeek === 6 ? "text-blue-500" : ""} ${isToday ? "font-bold text-primary" : ""}`}>
                    {cell.day}
                  </span>
                  {totals && (
                    <div className="mt-0.5 space-y-0.5">
                      {totals.income > 0 && (
                        <div className="text-[10px] font-mono text-emerald-600 leading-tight truncate">
                          +{formatCurrency(totals.income)}
                        </div>
                      )}
                      {totals.expense > 0 && (
                        <div className="text-[10px] font-mono text-rose-600 leading-tight truncate">
                          -{formatCurrency(totals.expense)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
