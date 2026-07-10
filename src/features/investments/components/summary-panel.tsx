"use client"

import { useState } from "react"

import {
  useAnnualSummary,
  useTickerBreakdown,
  useTradeSummary,
} from "@/features/investments/hooks/use-investments"
import { formatKrw, formatSignedKrw } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { TradeRangeFilter } from "@/types"
import type { TickerRowDto } from "@/types/api"

const CURRENT_YEAR = new Date().getFullYear()
const YEAR_WINDOW = 5

function gainClass(value: number): string {
  return value > 0 ? "text-gain" : value < 0 ? "text-loss" : "text-ink"
}

function yearRange(year: number | "all"): TradeRangeFilter {
  if (year === "all") return {}
  return { from: `${year}-01-01`, to: `${year}-12-31` }
}

/** 수익 요약 탭 — 기간 합계·종목별 보유/매도완료·연간 월별 (PRD §3.8) */
export function SummaryPanel() {
  const [year, setYear] = useState<number | "all">("all")
  const filter = yearRange(year)
  const { data: summary, isPending: summaryPending } = useTradeSummary(filter)
  const { data: tickers } = useTickerBreakdown(filter)
  const { data: annual } = useAnnualSummary(year === "all" ? CURRENT_YEAR : year)
  const [tickerTab, setTickerTab] = useState<"holding" | "closed">("holding")

  const years = Array.from({ length: YEAR_WINDOW }, (_, index) => CURRENT_YEAR - index)
  const tickerRows = tickers?.[tickerTab] ?? []

  return (
    <div className="flex flex-col gap-4 pb-8">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs font-medium text-ink-muted">수익 요약</h2>
        <select
          value={String(year)}
          aria-label="기간 선택"
          data-testid="summary-year-select"
          onChange={(event) =>
            setYear(event.target.value === "all" ? "all" : Number(event.target.value))
          }
          className="h-9 rounded-lg border border-hairline bg-surface-raised px-2 text-sm text-ink"
        >
          <option value="all">전체 기간</option>
          {years.map((value) => (
            <option key={value} value={value}>
              {value}년
            </option>
          ))}
        </select>
      </div>

      {summaryPending || !summary ? (
        <div className="h-28 animate-pulse rounded-xl bg-surface-sunken" aria-hidden />
      ) : (
        <section
          aria-label="수익 합계"
          className="grid grid-cols-2 gap-3 rounded-xl bg-surface-raised p-4 ring-1 ring-hairline"
        >
          <div>
            <p className="text-[11px] text-ink-muted">실현손익 + 배당</p>
            <p
              className={cn(
                "amount text-lg font-bold",
                gainClass(summary.netProfit),
              )}
              data-testid="summary-net-profit"
            >
              {formatSignedKrw(summary.netProfit)}
            </p>
            <p className="text-[11px] text-ink-muted">수익률 {summary.returnRate}%</p>
          </div>
          <dl className="flex flex-col gap-1 text-xs">
            <div className="flex justify-between">
              <dt className="text-ink-muted">총매수</dt>
              <dd className="amount text-ink">{formatKrw(summary.totalBuy)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">총매도</dt>
              <dd className="amount text-ink">{formatKrw(summary.totalSell)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">실현손익</dt>
              <dd className={cn("amount", gainClass(summary.realizedGain))}>
                {formatSignedKrw(summary.realizedGain)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">배당</dt>
              <dd className="amount text-ink">{formatKrw(summary.dividendIncome)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">수수료·세금</dt>
              <dd className="amount text-ink">
                {formatKrw(summary.feeTotal + summary.taxTotal)}
              </dd>
            </div>
          </dl>
        </section>
      )}

      <section aria-label="종목별 상세" className="flex flex-col gap-2">
        <div className="flex gap-1 rounded-xl bg-surface-sunken p-1">
          {(
            [
              ["holding", "보유 종목"],
              ["closed", "매도 완료"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tickerTab === value}
              onClick={() => setTickerTab(value)}
              className={cn(
                "h-9 flex-1 rounded-lg text-sm font-medium transition-colors",
                tickerTab === value
                  ? "bg-surface-raised text-ink shadow-sm"
                  : "text-ink-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {tickerRows.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">
            {tickerTab === "holding" ? "보유 중인 종목이 없습니다" : "매도 완료 종목이 없습니다"}
          </p>
        ) : (
          <ul className="divide-y divide-hairline rounded-xl bg-surface-raised ring-1 ring-hairline">
            {tickerRows.map((row) => (
              <TickerRow key={`${row.name}-${row.ticker ?? ""}`} row={row} />
            ))}
          </ul>
        )}
      </section>

      {annual && (
        <section aria-labelledby="annual-heading" className="flex flex-col gap-2">
          <h2 id="annual-heading" className="px-1 text-xs font-medium text-ink-muted">
            {year === "all" ? CURRENT_YEAR : year}년 월별 요약
          </h2>
          <div className="overflow-x-auto rounded-xl bg-surface-raised ring-1 ring-hairline">
            <table className="w-full min-w-[28rem] text-xs">
              <thead>
                <tr className="border-b border-hairline text-left text-ink-muted">
                  <th className="px-3 py-2 font-medium">월</th>
                  <th className="px-3 py-2 text-right font-medium">투자액</th>
                  <th className="px-3 py-2 text-right font-medium">실현손익</th>
                  <th className="px-3 py-2 text-right font-medium">배당</th>
                  <th className="px-3 py-2 text-right font-medium">수익률</th>
                </tr>
              </thead>
              <tbody>
                {annual.months.map((month) => (
                  <tr key={month.month} className="border-b border-hairline/60 last:border-0">
                    <td className="px-3 py-1.5 text-ink">{month.month}월</td>
                    <td className="amount px-3 py-1.5 text-right text-ink">
                      {formatKrw(month.investedAmount)}
                    </td>
                    <td
                      className={cn(
                        "amount px-3 py-1.5 text-right",
                        gainClass(month.realizedGain),
                      )}
                    >
                      {formatSignedKrw(month.realizedGain)}
                    </td>
                    <td className="amount px-3 py-1.5 text-right text-ink">
                      {formatKrw(month.dividendIncome)}
                    </td>
                    <td className="amount px-3 py-1.5 text-right text-ink">
                      {month.returnRate}%
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-hairline font-medium">
                  <td className="px-3 py-2 text-ink">합계</td>
                  <td className="amount px-3 py-2 text-right text-ink">
                    {formatKrw(annual.total.investedAmount)}
                  </td>
                  <td
                    className={cn(
                      "amount px-3 py-2 text-right",
                      gainClass(annual.total.realizedGain),
                    )}
                  >
                    {formatSignedKrw(annual.total.realizedGain)}
                  </td>
                  <td className="amount px-3 py-2 text-right text-ink">
                    {formatKrw(annual.total.dividendIncome)}
                  </td>
                  <td className="amount px-3 py-2 text-right text-ink">
                    {annual.total.returnRate}%
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

function TickerRow({ row }: { row: TickerRowDto }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <li data-testid="ticker-row">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-2 px-3 py-[var(--space-row)] text-left"
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-medium text-ink">
            {row.ticker ?? row.name}
            {row.ticker && <span className="ml-1.5 text-xs text-ink-muted">{row.name}</span>}
          </span>
          <span className="text-xs text-ink-muted">
            {row.quantity > 0
              ? `${row.quantity}주 · 평균 ${formatKrw(row.avgBuyPrice)}`
              : `총매수 ${formatKrw(row.totalBuyAmount)}`}
          </span>
        </span>
        <span className="flex flex-col items-end gap-0.5">
          <span
            className={cn(
              "amount text-sm font-semibold",
              gainClass(row.realizedGain + row.dividendIncome),
            )}
          >
            {formatSignedKrw(row.realizedGain + row.dividendIncome)}
          </span>
          <span className="text-[11px] text-ink-muted">{row.returnRate}%</span>
        </span>
      </button>
      {expanded && (
        <ul className="border-t border-hairline/60 bg-surface-sunken/40 px-3 py-1">
          {row.trades.map((trade) => (
            <li
              key={trade.id}
              className="flex items-center justify-between py-1 text-xs"
            >
              <span className="text-ink-muted">
                {trade.date} ·{" "}
                {trade.tradeType === "buy"
                  ? "매수"
                  : trade.tradeType === "sell"
                    ? "매도"
                    : "배당"}{" "}
                {trade.tradeType !== "dividend" && `${trade.quantity}주`}
              </span>
              <span className="amount text-ink">
                {formatKrw(trade.tradeType === "buy" ? trade.totalAmount : trade.netAmount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
