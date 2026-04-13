"use client"

import {
  Wallet,
  TrendingUp,
  TrendingDown,
  ArrowDownCircle,
  ArrowUpCircle,
  ArrowLeftRight,
  Landmark,
} from "lucide-react"
import { BudgetWidget } from "@/components/dashboard/BudgetWidget"
import { AssetWidget } from "@/components/dashboard/AssetWidget"
import { InvestmentWidget } from "@/components/dashboard/InvestmentWidget"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useDashboard } from "@/hooks/use-dashboard"
import { useAccounts } from "@/hooks/use-accounts"
import { formatCurrency } from "@/lib/utils"

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  cash: "현금",
  bank: "은행",
  card: "카드",
  savings: "저축",
  investment: "투자",
}

export default function DashboardPage() {
  const { data: dashboard, isLoading } = useDashboard()
  const { data: accounts } = useAccounts()

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">대시보드</h1>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
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

  const summaryCards = [
    {
      title: "총 잔액",
      value: formatCurrency(dashboard.totalBalance),
      icon: Wallet,
      description: `${dashboard.accountCount}개 계좌`,
    },
    {
      title: "이번 달 수입",
      value: formatCurrency(dashboard.monthlyIncome),
      icon: TrendingUp,
      className: "text-emerald-600",
    },
    {
      title: "이번 달 지출",
      value: formatCurrency(dashboard.monthlyExpense),
      icon: TrendingDown,
      className: "text-rose-600",
    },
    {
      title: "이번 달 순수익",
      value: formatCurrency(dashboard.monthlyNet),
      icon: dashboard.monthlyNet >= 0 ? TrendingUp : TrendingDown,
      className: dashboard.monthlyNet >= 0 ? "text-emerald-600" : "text-rose-600",
    },
  ]

  const typeIcon = {
    income: ArrowDownCircle,
    expense: ArrowUpCircle,
    transfer: ArrowLeftRight,
  }

  const typeLabel = {
    income: "수입",
    expense: "지출",
    transfer: "이체",
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">대시보드</h1>

      {/* 요약 카드 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon
          return (
            <Card key={card.title} size="sm">
              <CardHeader>
                <CardDescription className="flex items-center gap-1.5">
                  <Icon className="size-4" />
                  {card.title}
                </CardDescription>
                <CardTitle
                  className={`text-xl font-mono ${card.className ?? ""}`}
                >
                  {card.value}
                </CardTitle>
              </CardHeader>
              {card.description && (
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    {card.description}
                  </p>
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 순자산 */}
        <AssetWidget />

        {/* 투자 수익률 */}
        <InvestmentWidget />

        {/* 예산 소진율 */}
        <BudgetWidget />

        {/* 계좌별 잔액 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Landmark className="size-4" />
              계좌별 잔액
            </CardTitle>
          </CardHeader>
          <CardContent>
            {accounts && accounts.length > 0 ? (
              <div className="space-y-3">
                {accounts
                  .filter((a) => a.isActive)
                  .map((account) => (
                    <div
                      key={account.id}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="size-2 rounded-full"
                          style={{
                            backgroundColor: account.color ?? "#94a3b8",
                          }}
                        />
                        <span className="text-sm font-medium">
                          {account.name}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {ACCOUNT_TYPE_LABELS[account.type] ?? account.type}
                        </Badge>
                      </div>
                      <span className="text-sm font-mono font-medium">
                        {formatCurrency(account.currentBalance)}
                      </span>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                등록된 계좌가 없습니다.
              </p>
            )}
          </CardContent>
        </Card>

        {/* 최근 거래 */}
        <Card>
          <CardHeader>
            <CardTitle>최근 거래</CardTitle>
          </CardHeader>
          <CardContent>
            {dashboard.recentTransactions.length > 0 ? (
              <div className="space-y-3">
                {dashboard.recentTransactions.map((tx) => {
                  const TxIcon =
                    typeIcon[tx.type as keyof typeof typeIcon] ??
                    ArrowLeftRight
                  const isExpense = tx.type === "expense"
                  return (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <TxIcon
                          className={`size-4 shrink-0 ${
                            isExpense ? "text-rose-500" : "text-emerald-500"
                          }`}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {tx.description}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {tx.date} ·{" "}
                            {typeLabel[tx.type as keyof typeof typeLabel]}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`text-sm font-mono font-medium shrink-0 ${
                          isExpense ? "text-rose-600" : "text-emerald-600"
                        }`}
                      >
                        {isExpense ? "-" : "+"}
                        {formatCurrency(tx.amount)}
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                최근 거래가 없습니다.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
