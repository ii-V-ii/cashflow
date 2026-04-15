"use client"

import {
  Wallet,
  TrendingUp,
  TrendingDown,
  BarChart3,
  PiggyBank,
} from "lucide-react"
import { BudgetWidget } from "@/components/dashboard/BudgetWidget"
import { CalendarWidget } from "@/components/dashboard/CalendarWidget"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useDashboard } from "@/hooks/use-dashboard"
import { useAssets } from "@/hooks/use-assets"
import { useAnnualTradeReport } from "@/hooks/use-investment-trades"
import { formatCurrency } from "@/lib/utils"

export default function DashboardPage() {
  const { data: dashboard, isLoading } = useDashboard()
  const { data: assets } = useAssets()

  const now = new Date()
  const { data: tradeReport } = useAnnualTradeReport(now.getFullYear())

  // 순자산 계산
  const totalAssetValue = (assets ?? []).reduce((sum, a) => sum + a.currentValue, 0)
  const totalAcquisitionCost = (assets ?? []).reduce((sum, a) => sum + a.acquisitionCost, 0)
  const assetGain = totalAssetValue - totalAcquisitionCost
  const assetReturnRate = totalAcquisitionCost > 0 ? (assetGain / totalAcquisitionCost) * 100 : 0

  // 투자 수익 계산 (매매 기록 기반)
  const investReturn = tradeReport
    ? tradeReport.totalRealizedGain + tradeReport.totalDividend
    : 0

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">대시보드</h1>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    )
  }

  if (!dashboard) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">대시보드</h1>
        <p className="text-muted-foreground">데이터를 불러올 수 없습니다.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">대시보드</h1>

      {/* 요약 카드 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* 순자산 */}
        <SummaryCard
          title="순자산"
          icon={PiggyBank}
          value={formatCurrency(totalAssetValue)}
          sub={
            totalAcquisitionCost > 0
              ? `${assetGain >= 0 ? "+" : "-"}${formatCurrency(Math.abs(assetGain))} (${assetReturnRate >= 0 ? "+" : ""}${assetReturnRate.toFixed(1)}%)`
              : undefined
          }
          subClassName={assetGain >= 0 ? "text-emerald-600" : "text-rose-600"}
        />

        {/* 총 잔액 */}
        <SummaryCard
          title="총 잔액"
          icon={Wallet}
          value={formatCurrency(dashboard.totalBalance)}
          description={`${dashboard.accountCount}개 계좌`}
        />

        {/* 투자 수익 */}
        <SummaryCard
          title={`${now.getFullYear()}년 투자 수익`}
          icon={BarChart3}
          value={formatCurrency(investReturn)}
          valueClassName={investReturn >= 0 ? "text-emerald-600" : "text-rose-600"}
          sub={
            tradeReport
              ? `배당 ${formatCurrency(tradeReport.totalDividend)} · 실현 ${formatCurrency(tradeReport.totalRealizedGain)}`
              : undefined
          }
        />

        {/* 이번 달 수입 */}
        <SummaryCard
          title="이번 달 수입"
          icon={TrendingUp}
          value={formatCurrency(dashboard.monthlyIncome)}
          valueClassName="text-emerald-600"
        />

        {/* 이번 달 지출 */}
        <SummaryCard
          title="이번 달 지출"
          icon={TrendingDown}
          value={formatCurrency(dashboard.monthlyExpense)}
          valueClassName="text-rose-600"
        />

        {/* 이번 달 순수익 */}
        <SummaryCard
          title="이번 달 순수익"
          icon={dashboard.monthlyNet >= 0 ? TrendingUp : TrendingDown}
          value={formatCurrency(dashboard.monthlyNet)}
          valueClassName={dashboard.monthlyNet >= 0 ? "text-emerald-600" : "text-rose-600"}
        />
      </div>

      {/* 거래 캘린더 */}
      <CalendarWidget />

      {/* 예산 소진율 */}
      <BudgetWidget />
    </div>
  )
}

function SummaryCard({
  title,
  icon: Icon,
  value,
  valueClassName,
  description,
  sub,
  subClassName,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  value: string
  valueClassName?: string
  description?: string
  sub?: string
  subClassName?: string
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5">
          <Icon className="size-4" />
          {title}
        </CardDescription>
        <CardTitle className={`text-xl font-mono ${valueClassName ?? ""}`}>
          {value}
        </CardTitle>
      </CardHeader>
      {(description || sub) && (
        <CardContent>
          {sub && (
            <p className={`text-xs font-mono ${subClassName ?? "text-muted-foreground"}`}>
              {sub}
            </p>
          )}
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </CardContent>
      )}
    </Card>
  )
}
