import "server-only"

import type postgres from "postgres"

import type {
  AnnualQuery,
  CreateInvestmentTradeInput,
  ListTradesQuery,
  TradeRangeQuery,
  UpdateTradeMemoInput,
} from "@/lib/validators"
import { ApiError } from "@/server/api-errors"
import { getDb } from "@/server/db/client"
import { callRpc } from "@/server/rpc"
import type {
  AnnualMonthDto,
  AnnualSummaryDto,
  PageDto,
  TickerBreakdownDto,
  TickerRowDto,
  TradeDto,
  TradeSummaryDto,
} from "@/types/api"

type Row = postgres.Row

const RATE_DECIMALS = 100 // 소수 2자리
const MONTHS_IN_YEAR = 12

function roundRate(value: number): number {
  return Math.round(value * RATE_DECIMALS) / RATE_DECIMALS
}

function returnRateOf(realizedGain: number, dividend: number, totalBuy: number): number {
  return totalBuy > 0 ? roundRate(((realizedGain + dividend) / totalBuy) * 100) : 0
}

/** investment_trades ⋈ assets SELECT 컬럼 (매매 별칭 인자) */
function tradeColumns(alias: string): string {
  const t = alias
  return `
    ${t}.id, ${t}.asset_id, ${t}.trade_type, ${t}.date::text AS date, ${t}.ticker,
    ${t}.quantity::float8 AS quantity, ${t}.unit_price, ${t}.total_amount,
    ${t}.fee, ${t}.tax, ${t}.net_amount,
    ${t}.remaining_quantity::float8 AS remaining_quantity, ${t}.realized_gain,
    ${t}.memo, ${t}.account_id, ${t}.created_at, ${t}.updated_at,
    a.name AS asset_name
  `
}

function mapTradeRow(row: Row): TradeDto {
  const tradeType = row.trade_type as TradeDto["tradeType"]
  return {
    id: row.id as string,
    assetId: row.asset_id as string,
    asset: { id: row.asset_id as string, name: row.asset_name as string },
    tradeType,
    date: row.date as string,
    ticker: (row.ticker as string | null) ?? null,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price),
    totalAmount: Number(row.total_amount),
    fee: Number(row.fee),
    tax: Number(row.tax),
    netAmount: Number(row.net_amount),
    remainingQuantity: tradeType === "buy" ? Number(row.remaining_quantity) : null,
    realizedGain: tradeType === "sell" ? Number(row.realized_gain) : null,
    memo: (row.memo as string | null) ?? null,
    accountId: (row.account_id as string | null) ?? null,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  }
}

/** GET /investment-trades — 목록 + total (API.md §11.1) */
export async function listTrades(query: ListTradesQuery): Promise<PageDto<TradeDto>> {
  const sql = getDb()
  const offset = (query.page - 1) * query.limit
  const rows = await sql`
    SELECT ${sql.unsafe(tradeColumns("t"))}, count(*) OVER ()::int AS total_count
    FROM investment_trades t
    JOIN assets a ON a.id = t.asset_id
    WHERE (${query.assetId ?? null}::uuid IS NULL OR t.asset_id = ${query.assetId ?? null})
      AND (${query.from ?? null}::date IS NULL OR t.date >= ${query.from ?? null})
      AND (${query.to ?? null}::date IS NULL OR t.date <= ${query.to ?? null})
    ORDER BY t.date DESC, t.created_at DESC
    LIMIT ${query.limit} OFFSET ${offset}
  `
  // 범위 밖 페이지(빈 결과)는 window count가 없으므로 total을 별도 조회 (드문 경로)
  let total = rows.length > 0 ? Number(rows[0].total_count) : 0
  if (rows.length === 0) {
    const countRows = await sql`
      SELECT count(*)::int AS n
      FROM investment_trades t
      WHERE (${query.assetId ?? null}::uuid IS NULL OR t.asset_id = ${query.assetId ?? null})
        AND (${query.from ?? null}::date IS NULL OR t.date >= ${query.from ?? null})
        AND (${query.to ?? null}::date IS NULL OR t.date <= ${query.to ?? null})
    `
    total = Number(countRows[0].n)
  }
  return {
    items: rows.map(mapTradeRow),
    total,
    page: query.page,
    limit: query.limit,
  }
}

/** POST /investment-trades — RPC 1왕복 FIFO (API.md §11.2) */
export async function createTrade(
  input: CreateInvestmentTradeInput,
): Promise<TradeDto> {
  const sql = getDb()
  const payload = {
    asset_id: input.assetId,
    trade_type: input.tradeType,
    date: input.date,
    ticker: input.ticker,
    quantity: input.quantity,
    unit_price: input.unitPrice,
    total_amount: input.totalAmount,
    fee: input.fee,
    tax: input.tax,
    net_amount: input.netAmount,
    memo: input.memo ?? null,
    account_id: input.accountId ?? null,
  }
  const rows = await sql`
    WITH t AS (
      SELECT * FROM public.create_investment_trade(${sql.json(payload as never)})
    )
    SELECT ${sql.unsafe(tradeColumns("t"))}
    FROM t
    JOIN assets a ON a.id = t.asset_id
  `
  return mapTradeRow(rows[0])
}

/** GET /investment-trades/{id} (API.md §11.3) */
export async function getTrade(id: string): Promise<TradeDto> {
  const sql = getDb()
  const rows = await sql`
    SELECT ${sql.unsafe(tradeColumns("t"))}
    FROM investment_trades t
    JOIN assets a ON a.id = t.asset_id
    WHERE t.id = ${id}
  `
  if (rows.length === 0) {
    throw new ApiError(404, "NOT_FOUND", `매매 기록을 찾을 수 없습니다: ${id}`)
  }
  return mapTradeRow(rows[0])
}

/** PATCH /investment-trades/{id} — 메모만 수정 (API.md §11.4) */
export async function updateTradeMemo(
  id: string,
  input: UpdateTradeMemoInput,
): Promise<TradeDto> {
  const sql = getDb()
  const rows = await sql`
    WITH t AS (
      UPDATE investment_trades SET memo = ${input.memo} WHERE id = ${id} RETURNING *
    )
    SELECT ${sql.unsafe(tradeColumns("t"))}
    FROM t
    JOIN assets a ON a.id = t.asset_id
  `
  if (rows.length === 0) {
    throw new ApiError(404, "NOT_FOUND", `매매 기록을 찾을 수 없습니다: ${id}`)
  }
  return mapTradeRow(rows[0])
}

/** DELETE /investment-trades/{id} — 역FIFO RPC 1왕복 (API.md §11.5) */
export async function deleteTrade(id: string): Promise<{ id: string }> {
  const deleted = await callRpc<boolean>("delete_investment_trade", { p_id: id })
  if (!deleted) {
    throw new ApiError(404, "NOT_FOUND", `매매 기록을 찾을 수 없습니다: ${id}`)
  }
  return { id }
}

// ─── summary / tickers / annual ─────────────────────────────

interface RpcSummaryAssetRow {
  asset_id: string
  ticker: string | null
  total_buy: number
  total_sell: number
  dividend_income: number
  realized_gain: number
  fee_total: number
  tax_total: number
  return_rate: number
  holding_qty: number
  avg_buy_price: number
}

interface RpcSummary {
  total: {
    total_buy: number
    total_sell: number
    realized_gain: number
    dividend_income: number
    fee_total: number
    tax_total: number
    net_profit: number
    return_rate: number
  }
  assets: RpcSummaryAssetRow[]
}

interface SummaryScope {
  scope: "all" | "year" | "month"
  year?: number
  month?: number
}

/**
 * from/to → get_investment_summary(p_scope) 매핑 (API.md §11.6 구현 메모).
 * 지원: 미지정(all) / 연도 경계(YYYY-01-01 ~ YYYY-12-31) / 월 경계(1일 ~ 말일).
 */
export function rangeToScope(from?: string, to?: string): SummaryScope {
  if (!from && !to) return { scope: "all" }
  if (!from || !to) {
    throw new ApiError(400, "VALIDATION_ERROR", "from/to는 함께 지정해야 합니다")
  }
  const [fromYear, fromMonth, fromDay] = from.split("-").map(Number)
  const [toYear, toMonth, toDay] = to.split("-").map(Number)

  if (fromMonth === 1 && fromDay === 1 && toYear === fromYear && toMonth === 12 && toDay === 31) {
    return { scope: "year", year: fromYear }
  }
  const lastDay = new Date(Date.UTC(fromYear, fromMonth, 0)).getUTCDate()
  if (fromDay === 1 && toYear === fromYear && toMonth === fromMonth && toDay === lastDay) {
    return { scope: "month", year: fromYear, month: fromMonth }
  }
  throw new ApiError(
    400,
    "VALIDATION_ERROR",
    "지원하지 않는 기간입니다 (전체·연도·월 경계만 지원)",
  )
}

function summaryFromAssetRows(rows: RpcSummaryAssetRow[]): TradeSummaryDto {
  const totalBuy = rows.reduce((sum, row) => sum + row.total_buy, 0)
  const realizedGain = rows.reduce((sum, row) => sum + row.realized_gain, 0)
  const dividendIncome = rows.reduce((sum, row) => sum + row.dividend_income, 0)
  return {
    totalBuy,
    totalSell: rows.reduce((sum, row) => sum + row.total_sell, 0),
    realizedGain,
    dividendIncome,
    feeTotal: rows.reduce((sum, row) => sum + row.fee_total, 0),
    taxTotal: rows.reduce((sum, row) => sum + row.tax_total, 0),
    netProfit: realizedGain + dividendIncome,
    returnRate: returnRateOf(realizedGain, dividendIncome, totalBuy),
  }
}

/** GET /investment-trades/summary — RPC 1왕복 (API.md §11.6, DB.md §3.13) */
export async function getSummary(query: TradeRangeQuery): Promise<TradeSummaryDto> {
  const { scope, year, month } = rangeToScope(query.from, query.to)
  const result = await callRpc<RpcSummary>("get_investment_summary", {
    p_scope: scope,
    p_year: year ?? null,
    p_month: month ?? null,
  })

  if (query.assetId) {
    return summaryFromAssetRows(
      result.assets.filter((row) => row.asset_id === query.assetId),
    )
  }
  return {
    totalBuy: result.total.total_buy,
    totalSell: result.total.total_sell,
    realizedGain: result.total.realized_gain,
    dividendIncome: result.total.dividend_income,
    feeTotal: result.total.fee_total,
    taxTotal: result.total.tax_total,
    netProfit: result.total.net_profit,
    returnRate: Number(result.total.return_rate),
  }
}

interface TickerAccumulator {
  assetId: string
  ticker: string | null
  name: string
  totalBuyAmount: number
  totalBuyQuantity: number
  totalSellAmount: number
  dividendIncome: number
  realizedGain: number
  trades: TradeDto[]
}

/** GET /investment-trades/tickers — 보유/매도완료 (API.md §11.7, 1~2왕복) */
export async function getTickerBreakdown(
  query: TradeRangeQuery,
): Promise<TickerBreakdownDto> {
  const sql = getDb()
  const tradeRows = await sql`
    SELECT ${sql.unsafe(tradeColumns("t"))}
    FROM investment_trades t
    JOIN assets a ON a.id = t.asset_id
    WHERE (${query.assetId ?? null}::uuid IS NULL OR t.asset_id = ${query.assetId ?? null})
      AND (${query.from ?? null}::date IS NULL OR t.date >= ${query.from ?? null})
      AND (${query.to ?? null}::date IS NULL OR t.date <= ${query.to ?? null})
    ORDER BY t.date DESC, t.created_at DESC
  `
  const lotRows = await sql`
    SELECT asset_id, ticker,
           SUM(remaining_quantity)::float8 AS holding_qty,
           SUM(remaining_cost)::bigint AS holding_cost
    FROM open_lots_v
    GROUP BY asset_id, ticker
  `

  const groupKey = (assetId: string, ticker: string | null) => `${assetId}::${ticker ?? ""}`
  const groups = new Map<string, TickerAccumulator>()

  for (const row of tradeRows) {
    const trade = mapTradeRow(row)
    const key = groupKey(trade.assetId, trade.ticker)
    const group = groups.get(key) ?? {
      assetId: trade.assetId,
      ticker: trade.ticker,
      name: trade.asset.name,
      totalBuyAmount: 0,
      totalBuyQuantity: 0,
      totalSellAmount: 0,
      dividendIncome: 0,
      realizedGain: 0,
      trades: [],
    }
    const next: TickerAccumulator = {
      ...group,
      totalBuyAmount:
        group.totalBuyAmount + (trade.tradeType === "buy" ? trade.totalAmount : 0),
      totalBuyQuantity:
        group.totalBuyQuantity + (trade.tradeType === "buy" ? trade.quantity : 0),
      totalSellAmount:
        group.totalSellAmount + (trade.tradeType === "sell" ? trade.netAmount : 0),
      dividendIncome:
        group.dividendIncome + (trade.tradeType === "dividend" ? trade.netAmount : 0),
      realizedGain:
        group.realizedGain + (trade.tradeType === "sell" ? (trade.realizedGain ?? 0) : 0),
      trades: [...group.trades, trade],
    }
    groups.set(key, next)
  }

  const holdingByKey = new Map(
    lotRows.map((row) => [
      groupKey(row.asset_id as string, (row.ticker as string | null) ?? null),
      { quantity: Number(row.holding_qty), cost: Number(row.holding_cost) },
    ]),
  )

  const holding: TickerRowDto[] = []
  const closed: TickerRowDto[] = []
  for (const [key, group] of groups) {
    const lot = holdingByKey.get(key)
    const quantity = lot?.quantity ?? 0
    const isHolding = quantity > 0
    const avgBuyPrice = isHolding
      ? Math.round((lot?.cost ?? 0) / quantity)
      : group.totalBuyQuantity > 0
        ? Math.round(group.totalBuyAmount / group.totalBuyQuantity)
        : 0
    const rowDto: TickerRowDto = {
      ticker: group.ticker,
      name: group.name,
      quantity,
      avgBuyPrice,
      totalBuyAmount: group.totalBuyAmount,
      totalSellAmount: group.totalSellAmount,
      dividendIncome: group.dividendIncome,
      realizedGain: group.realizedGain,
      returnRate: returnRateOf(
        group.realizedGain,
        group.dividendIncome,
        group.totalBuyAmount,
      ),
      trades: group.trades,
    }
    if (isHolding) holding.push(rowDto)
    else closed.push(rowDto)
  }

  const byName = (a: TickerRowDto, b: TickerRowDto) =>
    a.name.localeCompare(b.name) || (a.ticker ?? "").localeCompare(b.ticker ?? "")
  return { holding: holding.sort(byName), closed: closed.sort(byName) }
}

/** GET /investment-trades/annual — monthly_investment_summary_v 1왕복 (API.md §11.8) */
export async function getAnnualSummary(query: AnnualQuery): Promise<AnnualSummaryDto> {
  const sql = getDb()
  const rows = await sql`
    SELECT month,
           SUM(invested_amount)::bigint AS invested_amount,
           SUM(dividend_income)::bigint AS dividend_income,
           SUM(realized_gain)::bigint AS realized_gain
    FROM monthly_investment_summary_v
    WHERE year = ${query.year}
    GROUP BY month
  `
  const byMonth = new Map(rows.map((row) => [Number(row.month), row]))
  const months: AnnualMonthDto[] = Array.from(
    { length: MONTHS_IN_YEAR },
    (_, index) => {
      const row = byMonth.get(index + 1)
      const investedAmount = row ? Number(row.invested_amount) : 0
      const dividendIncome = row ? Number(row.dividend_income) : 0
      const realizedGain = row ? Number(row.realized_gain) : 0
      return {
        month: index + 1,
        investedAmount,
        dividendIncome,
        realizedGain,
        returnRate: returnRateOf(realizedGain, dividendIncome, investedAmount),
      }
    },
  )
  const total = months.reduce(
    (acc, month) => ({
      investedAmount: acc.investedAmount + month.investedAmount,
      dividendIncome: acc.dividendIncome + month.dividendIncome,
      realizedGain: acc.realizedGain + month.realizedGain,
    }),
    { investedAmount: 0, dividendIncome: 0, realizedGain: 0 },
  )
  return {
    months,
    total: {
      ...total,
      returnRate: returnRateOf(
        total.realizedGain,
        total.dividendIncome,
        total.investedAmount,
      ),
    },
  }
}
