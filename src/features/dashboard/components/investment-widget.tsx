import Link from "next/link"

import { formatKrw, formatSignedKrw } from "@/lib/format"
import type { DashboardInvestmentDto } from "@/types/api"

interface InvestmentWidgetProps {
  /** 활성 자산이 하나도 없으면 null (get_dashboard.investment) */
  investment: DashboardInvestmentDto | null
}

/** 투자 요약 위젯 — 해당 월 실현손익·배당 + 보유 평가액 (API.md §8.1) */
export function InvestmentWidget({ investment }: InvestmentWidgetProps) {
  if (investment === null) {
    return (
      <div className="flex flex-col gap-1 rounded-xl bg-surface-raised p-4 ring-1 ring-hairline">
        <p className="text-xs font-medium text-ink-muted">투자 요약</p>
        <p className="text-sm text-ink-muted">등록된 자산이 없습니다</p>
        <Link
          href="/assets"
          className="flex min-h-11 items-center text-xs font-medium text-ink underline underline-offset-2"
        >
          자산 등록
        </Link>
      </div>
    )
  }

  const gainTone =
    investment.realizedGain > 0
      ? "text-income-fg"
      : investment.realizedGain < 0
        ? "text-expense-fg"
        : "text-ink"

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-surface-raised p-4 ring-1 ring-hairline">
      <p className="text-xs font-medium text-ink-muted">투자 요약</p>
      <div>
        <p className="text-[10px] text-ink-muted">이번 달 실현손익</p>
        <p
          data-testid="investment-realized-gain"
          className={`amount text-[length:var(--text-amount-md)] font-semibold ${gainTone}`}
        >
          {formatSignedKrw(investment.realizedGain)}
        </p>
      </div>
      <div className="flex flex-col gap-0.5 text-xs text-ink-muted">
        <p className="amount">배당 {formatKrw(investment.dividend)}</p>
        <p className="amount">평가액 {formatKrw(investment.totalValue)}</p>
      </div>
    </div>
  )
}
