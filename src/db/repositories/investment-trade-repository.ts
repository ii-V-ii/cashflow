import { eq, and, sql, desc, asc, gte, lt, gt } from 'drizzle-orm'
import { getDb } from '../index'
import { investmentTrades, assets } from '../schema'
import { generateId } from '../../lib/utils'
import type { CreateInvestmentTradeInput, UpdateInvestmentTradeInput } from '../../lib/validators'

export async function findAllInvestmentTrades(
  assetId?: string,
  from?: string,
  to?: string,
  pagination?: { page?: number; limit?: number },
) {
  const db = getDb()
  const conditions = []
  if (assetId) conditions.push(eq(investmentTrades.assetId, assetId))
  if (from) conditions.push(gte(investmentTrades.date, from))
  if (to) conditions.push(lt(investmentTrades.date, to))

  const where = conditions.length > 0
    ? conditions.length === 1 ? conditions[0] : and(...conditions)
    : undefined

  const page = pagination?.page ?? 1
  const limit = pagination?.limit ?? 20
  const offset = (page - 1) * limit

  const [data, countRows] = await Promise.all([
    db
      .select()
      .from(investmentTrades)
      .where(where)
      .orderBy(desc(investmentTrades.date), desc(investmentTrades.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::integer`.as('total') })
      .from(investmentTrades)
      .where(where),
  ])

  const total = countRows[0]?.total ?? 0

  return { data, total, page, limit }
}

export async function findInvestmentTradeById(id: string) {
  const db = getDb()
  const rows = await db.select().from(investmentTrades).where(eq(investmentTrades.id, id))
  return rows[0] ?? null
}

export async function createInvestmentTrade(input: CreateInvestmentTradeInput) {
  const db = getDb()
  const id = generateId()

  await db.insert(investmentTrades).values({
    id,
    assetId: input.assetId,
    tradeType: input.tradeType,
    date: input.date,
    ticker: input.ticker ?? null,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    totalAmount: input.totalAmount,
    fee: input.fee ?? 0,
    tax: input.tax ?? 0,
    netAmount: input.netAmount,
    memo: input.memo ?? null,
    accountId: input.accountId ?? null,
  })

  return (await findInvestmentTradeById(id))!
}

export async function updateInvestmentTrade(id: string, input: UpdateInvestmentTradeInput) {
  const db = getDb()
  const existing = await findInvestmentTradeById(id)
  if (!existing) return null

  await db.update(investmentTrades)
    .set({
      ...(input.assetId !== undefined && { assetId: input.assetId }),
      ...(input.tradeType !== undefined && { tradeType: input.tradeType }),
      ...(input.date !== undefined && { date: input.date }),
      ...(input.ticker !== undefined && { ticker: input.ticker }),
      ...(input.quantity !== undefined && { quantity: input.quantity }),
      ...(input.unitPrice !== undefined && { unitPrice: input.unitPrice }),
      ...(input.totalAmount !== undefined && { totalAmount: input.totalAmount }),
      ...(input.fee !== undefined && { fee: input.fee }),
      ...(input.tax !== undefined && { tax: input.tax }),
      ...(input.netAmount !== undefined && { netAmount: input.netAmount }),
      ...(input.memo !== undefined && { memo: input.memo }),
      ...(input.accountId !== undefined && { accountId: input.accountId }),
    })
    .where(eq(investmentTrades.id, id))

  return (await findInvestmentTradeById(id))!
}

export async function deleteInvestmentTrade(id: string) {
  const db = getDb()
  const existing = await findInvestmentTradeById(id)
  if (!existing) return null

  await db.delete(investmentTrades).where(eq(investmentTrades.id, id))
  return existing
}

export async function getTickerSummaries(assetId: string, from?: string, to?: string) {
  const db = getDb()
  const hasPeriod = !!(from && to)

  const rows = await db.execute(sql`
    WITH open_lots AS (
      SELECT ticker,
        SUM(remaining_quantity) AS holding_qty,
        CASE WHEN SUM(remaining_quantity) > 0
          THEN ROUND(SUM(unit_price * remaining_quantity)::numeric / SUM(remaining_quantity))
          ELSE 0
        END AS avg_buy_price,
        SUM(unit_price * remaining_quantity)::integer AS total_buy_amount
      FROM ${investmentTrades}
      WHERE asset_id = ${assetId} AND trade_type = 'buy' AND remaining_quantity > 0
      GROUP BY ticker
    ),
    period_sell AS (
      SELECT ticker,
        COALESCE(SUM(net_amount), 0)::integer AS net,
        COALESCE(SUM(realized_gain), 0)::integer AS gain
      FROM ${investmentTrades}
      WHERE asset_id = ${assetId} AND trade_type = 'sell'
        ${hasPeriod ? sql`AND date >= ${from} AND date < ${to}` : sql``}
      GROUP BY ticker
    ),
    period_div AS (
      SELECT ticker,
        COALESCE(SUM(net_amount), 0)::integer AS net
      FROM ${investmentTrades}
      WHERE asset_id = ${assetId} AND trade_type = 'dividend'
        ${hasPeriod ? sql`AND date >= ${from} AND date < ${to}` : sql``}
      GROUP BY ticker
    ),
    all_tickers AS (
      SELECT DISTINCT ticker FROM ${investmentTrades} WHERE asset_id = ${assetId}
    )
    SELECT
      t.ticker,
      COALESCE(o.holding_qty, 0)::numeric AS holding_qty,
      COALESCE(o.avg_buy_price, 0)::integer AS avg_buy_price,
      COALESCE(o.total_buy_amount, 0)::integer AS total_buy_amount,
      COALESCE(ps.net, 0)::integer AS total_sell_net,
      COALESCE(pd.net, 0)::integer AS total_dividend,
      COALESCE(ps.gain, 0)::integer AS realized_gain
    FROM all_tickers t
    LEFT JOIN open_lots o ON o.ticker = t.ticker
    LEFT JOIN period_sell ps ON ps.ticker = t.ticker
    LEFT JOIN period_div pd ON pd.ticker = t.ticker
    WHERE COALESCE(o.holding_qty, 0) > 0 OR COALESCE(ps.net, 0) > 0 OR COALESCE(pd.net, 0) > 0
    ORDER BY t.ticker
  `) as unknown as Array<{
    ticker: string
    holding_qty: number
    avg_buy_price: number
    total_buy_amount: number
    total_sell_net: number
    total_dividend: number
    realized_gain: number
  }>

  return rows.map(r => ({
    ticker: r.ticker ?? '(종목명 없음)',
    holdingQty: Number(r.holding_qty),
    avgBuyPrice: Number(r.avg_buy_price),
    totalBuyAmount: Number(r.total_buy_amount),
    totalSellNet: Number(r.total_sell_net),
    totalDividend: Number(r.total_dividend),
    realizedGain: Number(r.realized_gain),
  }))
}

export async function getMonthlyTradeSummary(year: number) {
  const db = getDb()
  const from = `${year}-01-01`
  const to = `${year + 1}-01-01`

  const rows = await db.execute(sql`
    SELECT
      EXTRACT(MONTH FROM date)::integer AS month,
      COALESCE(SUM(CASE WHEN trade_type = 'buy' THEN total_amount END), 0)::integer AS total_bought,
      COALESCE(SUM(CASE WHEN trade_type = 'sell' THEN net_amount END), 0)::integer AS total_sold,
      COALESCE(SUM(CASE WHEN trade_type = 'dividend' THEN net_amount END), 0)::integer AS total_dividend,
      COALESCE(SUM(CASE WHEN trade_type = 'sell' THEN realized_gain END), 0)::integer AS realized_gain
    FROM investment_trades
    WHERE date >= ${from} AND date < ${to}
    GROUP BY EXTRACT(MONTH FROM date)
    ORDER BY EXTRACT(MONTH FROM date)
  `) as unknown as Array<{
    month: number
    total_bought: number
    total_sold: number
    total_dividend: number
    realized_gain: number
  }>

  return rows.map(r => ({
    month: r.month,
    totalBought: r.total_bought,
    totalSold: r.total_sold,
    totalDividend: r.total_dividend,
    realizedGain: r.realized_gain,
  }))
}

export async function getAssetTradeSummary(assetId: string, from?: string, to?: string) {
  const db = getDb()
  const hasPeriod = !!(from && to)

  const rows = await db.execute(sql`
    WITH open_lots AS (
      SELECT
        COALESCE(SUM(remaining_quantity), 0) AS total_qty,
        COALESCE(SUM(unit_price * remaining_quantity), 0)::integer AS total_cost
      FROM ${investmentTrades}
      WHERE asset_id = ${assetId} AND trade_type = 'buy' AND remaining_quantity > 0
    ),
    period_sell AS (
      SELECT
        COALESCE(SUM(net_amount), 0)::integer AS net
      FROM ${investmentTrades}
      WHERE asset_id = ${assetId} AND trade_type = 'sell'
        ${hasPeriod ? sql`AND date >= ${from} AND date < ${to}` : sql``}
    ),
    period_buy AS (
      SELECT COALESCE(SUM(total_amount), 0)::integer AS total
      FROM ${investmentTrades}
      WHERE asset_id = ${assetId} AND trade_type = 'buy'
        ${hasPeriod ? sql`AND date >= ${from} AND date < ${to}` : sql``}
    ),
    period_div AS (
      SELECT COALESCE(SUM(net_amount), 0)::integer AS total
      FROM ${investmentTrades}
      WHERE asset_id = ${assetId} AND trade_type = 'dividend'
        ${hasPeriod ? sql`AND date >= ${from} AND date < ${to}` : sql``}
    ),
    period_gain AS (
      SELECT COALESCE(SUM(realized_gain), 0)::integer AS total
      FROM ${investmentTrades}
      WHERE asset_id = ${assetId} AND trade_type = 'sell'
        ${hasPeriod ? sql`AND date >= ${from} AND date < ${to}` : sql``}
    )
    SELECT
      o.total_qty, o.total_cost,
      (SELECT total FROM period_buy) AS total_bought,
      (SELECT net FROM period_sell) AS total_sold,
      (SELECT total FROM period_div) AS total_dividend,
      (SELECT total FROM period_gain) AS realized_gain
    FROM open_lots o
  `) as unknown as Array<{
    total_qty: number; total_cost: number; total_bought: number
    total_sold: number; total_dividend: number; realized_gain: number
  }>

  const [assetRow] = await db.select().from(assets).where(eq(assets.id, assetId))

  const r = rows[0]
  const totalQuantity = Number(r?.total_qty) || 0
  const holdingsCost = Number(r?.total_cost) || 0
  const totalBought = Number(r?.total_bought) || 0
  const totalSold = Number(r?.total_sold) || 0
  const totalDividend = Number(r?.total_dividend) || 0
  const realizedGain = Number(r?.realized_gain) || 0
  const avgBuyPrice = totalQuantity > 0 ? Math.round(holdingsCost / totalQuantity) : 0

  const totalReturn = totalBought > 0
    ? Math.round(((realizedGain + totalDividend) / totalBought) * 10000) / 100
    : 0

  return {
    assetId,
    assetName: assetRow?.name ?? '(삭제된 자산)',
    totalBought,
    totalSold,
    totalDividend,
    totalQuantity,
    avgBuyPrice,
    realizedGain,
    totalReturn,
  }
}

// === FIFO Lot Matching ===

interface MatchedLot {
  buyTradeId: string
  quantity: number
  costPerUnit: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function matchSellToLots(
  assetId: string,
  ticker: string | null,
  sellQty: number,
  sellNetAmount: number,
  tx: any,
): Promise<{ realizedGain: number; matchedLots: MatchedLot[] }> {
  // 열린 로트를 FIFO 순서로 조회
  const openLots = await tx
    .select({
      id: investmentTrades.id,
      unitPrice: investmentTrades.unitPrice,
      remainingQuantity: investmentTrades.remainingQuantity,
    })
    .from(investmentTrades)
    .where(and(
      eq(investmentTrades.assetId, assetId),
      ticker ? eq(investmentTrades.ticker, ticker) : sql`${investmentTrades.ticker} IS NULL`,
      eq(investmentTrades.tradeType, 'buy' as const),
      gt(investmentTrades.remainingQuantity, 0),
    ))
    .orderBy(asc(investmentTrades.date), asc(investmentTrades.createdAt))

  let remaining = sellQty
  let totalCost = 0
  const matchedLots: MatchedLot[] = []

  for (const lot of openLots) {
    if (remaining <= 0) break

    const lotRemaining = Number(lot.remainingQuantity)
    const matched = Math.min(lotRemaining, remaining)
    const costPerUnit = Number(lot.unitPrice)

    totalCost += matched * costPerUnit
    matchedLots.push({ buyTradeId: lot.id, quantity: matched, costPerUnit })

    const newRemaining = lotRemaining - matched
    await tx.update(investmentTrades)
      .set({ remainingQuantity: newRemaining })
      .where(eq(investmentTrades.id, lot.id))

    remaining -= matched
  }

  if (remaining > 0) {
    throw new Error('보유수량 부족: 매도 수량이 매수 잔여 수량을 초과합니다')
  }

  // 실현손익 = 매도 수령액(net) - 매칭된 매수 원가
  const realizedGain = Math.round(sellNetAmount - totalCost)

  return { realizedGain, matchedLots }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function reverseLotMatching(
  assetId: string,
  ticker: string | null,
  sellQty: number,
  tx: any,
): Promise<void> {
  // 역 FIFO: 가장 최근에 차감된 로트(remaining < quantity)부터 복원
  const partialLots = await tx
    .select({
      id: investmentTrades.id,
      quantity: investmentTrades.quantity,
      remainingQuantity: investmentTrades.remainingQuantity,
    })
    .from(investmentTrades)
    .where(and(
      eq(investmentTrades.assetId, assetId),
      ticker ? eq(investmentTrades.ticker, ticker) : sql`${investmentTrades.ticker} IS NULL`,
      eq(investmentTrades.tradeType, 'buy' as const),
    ))
    .orderBy(desc(investmentTrades.date), desc(investmentTrades.createdAt))

  let toRestore = sellQty

  for (const lot of partialLots) {
    if (toRestore <= 0) break

    const lotQty = Number(lot.quantity)
    const lotRemaining = Number(lot.remainingQuantity)
    const consumed = lotQty - lotRemaining // 이 로트에서 매도된 수량

    if (consumed <= 0) continue

    const restore = Math.min(consumed, toRestore)
    await tx.update(investmentTrades)
      .set({ remainingQuantity: lotRemaining + restore })
      .where(eq(investmentTrades.id, lot.id))

    toRestore -= restore
  }
}
