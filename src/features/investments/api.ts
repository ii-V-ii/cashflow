import { apiFetch } from "@/lib/api/http"
import type { CreateInvestmentTradeInput } from "@/lib/validators"
import type { TradeFilter, TradeRangeFilter } from "@/types"
import type {
  AnnualSummaryDto,
  PageDto,
  TickerBreakdownDto,
  TradeDto,
  TradeSummaryDto,
} from "@/types/api"

function toQueryString(entries: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined) params.set(key, String(value))
  }
  const query = params.toString()
  return query ? `?${query}` : ""
}

export function getTrades(
  filter: TradeFilter,
  page: number,
  limit = 20,
): Promise<PageDto<TradeDto>> {
  return apiFetch(
    `/api/v1/investment-trades${toQueryString({
      assetId: filter.assetId,
      from: filter.from,
      to: filter.to,
      page,
      limit,
    })}`,
  )
}

export function createTrade(input: CreateInvestmentTradeInput): Promise<TradeDto> {
  return apiFetch("/api/v1/investment-trades", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function updateTradeMemo(id: string, memo: string | null): Promise<TradeDto> {
  return apiFetch(`/api/v1/investment-trades/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ memo }),
  })
}

export function deleteTrade(id: string): Promise<{ id: string }> {
  return apiFetch(`/api/v1/investment-trades/${id}`, { method: "DELETE" })
}

export function getTradeSummary(filter: TradeRangeFilter): Promise<TradeSummaryDto> {
  return apiFetch(
    `/api/v1/investment-trades/summary${toQueryString({ from: filter.from, to: filter.to })}`,
  )
}

export function getTickerBreakdown(
  filter: TradeRangeFilter,
): Promise<TickerBreakdownDto> {
  return apiFetch(
    `/api/v1/investment-trades/tickers${toQueryString({ from: filter.from, to: filter.to })}`,
  )
}

export function getAnnualSummary(year: number): Promise<AnnualSummaryDto> {
  return apiFetch(`/api/v1/investment-trades/annual${toQueryString({ year })}`)
}
