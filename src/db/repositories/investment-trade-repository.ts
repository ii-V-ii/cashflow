import { eq, and, sql, desc, gte, lt } from 'drizzle-orm'
import { getDb } from '../index'
import { investmentTrades, assets } from '../schema'
import { generateId } from '../../lib/utils'
import type { CreateInvestmentTradeInput, UpdateInvestmentTradeInput } from '../../lib/validators'

export async function findAllInvestmentTrades(assetId?: string, from?: string, to?: string) {
  const db = getDb()
  const conditions = []
  if (assetId) conditions.push(eq(investmentTrades.assetId, assetId))
  if (from) conditions.push(gte(investmentTrades.date, from))
  if (to) conditions.push(lt(investmentTrades.date, to))

  const where = conditions.length > 0
    ? conditions.length === 1 ? conditions[0] : and(...conditions)
    : undefined

  return db
    .select()
    .from(investmentTrades)
    .where(where)
    .orderBy(desc(investmentTrades.date), desc(investmentTrades.createdAt))
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

  // 1) 누적 매수 (ticker별 평균매수단가) - to 이전까지
  const buyConditions = [`asset_id = '${assetId}'`, `trade_type = 'buy'`]
  if (hasPeriod) buyConditions.push(`date < '${to}'`)

  // 2) 누적 매도 수량 (보유수량 계산)
  const sellConditions = [`asset_id = '${assetId}'`, `trade_type = 'sell'`]
  if (hasPeriod) sellConditions.push(`date < '${to}'`)

  // 3) 매도/배당 (기간별)
  const sdConditions = [`asset_id = '${assetId}'`, `trade_type IN ('sell', 'dividend')`]
  if (hasPeriod) {
    sdConditions.push(`date >= '${from}'`)
    sdConditions.push(`date < '${to}'`)
  }

  const rows = await db.execute(sql`
    WITH cum_buy AS (
      SELECT ticker,
        COALESCE(SUM(quantity), 0) AS buy_qty,
        COALESCE(SUM(total_amount), 0) AS buy_total
      FROM ${investmentTrades}
      WHERE ${sql.raw(buyConditions.join(' AND '))}
      GROUP BY ticker
    ),
    cum_sell AS (
      SELECT ticker,
        COALESCE(SUM(quantity), 0) AS sell_qty
      FROM ${investmentTrades}
      WHERE ${sql.raw(sellConditions.join(' AND '))}
      GROUP BY ticker
    ),
    period_sd AS (
      SELECT ticker, trade_type,
        COALESCE(SUM(quantity), 0) AS qty,
        COALESCE(SUM(net_amount), 0) AS net
      FROM ${investmentTrades}
      WHERE ${sql.raw(sdConditions.join(' AND '))}
      GROUP BY ticker, trade_type
    )
    SELECT
      b.ticker,
      (b.buy_qty - COALESCE(s.sell_qty, 0))::numeric AS holding_qty,
      CASE WHEN b.buy_qty > 0 THEN ROUND(b.buy_total::numeric / b.buy_qty) ELSE 0 END AS avg_buy_price,
      b.buy_total::integer AS total_buy_amount,
      COALESCE(ps.net, 0)::integer AS total_sell_net,
      COALESCE(pd.net, 0)::integer AS total_dividend,
      (COALESCE(ps.net, 0) - CASE WHEN b.buy_qty > 0 THEN ROUND(b.buy_total::numeric / b.buy_qty * COALESCE(ps.qty, 0)) ELSE 0 END)::integer AS realized_gain
    FROM cum_buy b
    LEFT JOIN cum_sell s ON s.ticker = b.ticker
    LEFT JOIN period_sd ps ON ps.ticker = b.ticker AND ps.trade_type = 'sell'
    LEFT JOIN period_sd pd ON pd.ticker = b.ticker AND pd.trade_type = 'dividend'
    ORDER BY b.ticker
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
    WITH buy_avg AS (
      SELECT ticker,
        COALESCE(SUM(total_amount), 0) AS total_amt,
        COALESCE(SUM(quantity), 0) AS total_qty
      FROM investment_trades
      WHERE trade_type = 'buy' AND date < ${to}
      GROUP BY ticker
    ),
    monthly AS (
      SELECT
        EXTRACT(MONTH FROM date)::integer AS month,
        trade_type,
        ticker,
        COALESCE(SUM(total_amount), 0)::integer AS total_amount,
        COALESCE(SUM(net_amount), 0)::integer AS total_net,
        COALESCE(SUM(quantity), 0) AS total_qty
      FROM investment_trades
      WHERE date >= ${from} AND date < ${to}
      GROUP BY EXTRACT(MONTH FROM date), trade_type, ticker
    )
    SELECT
      m.month,
      COALESCE(SUM(CASE WHEN m.trade_type = 'buy' THEN m.total_amount END), 0)::integer AS total_bought,
      COALESCE(SUM(CASE WHEN m.trade_type = 'sell' THEN m.total_net END), 0)::integer AS total_sold,
      COALESCE(SUM(CASE WHEN m.trade_type = 'dividend' THEN m.total_net END), 0)::integer AS total_dividend,
      COALESCE(SUM(CASE WHEN m.trade_type = 'sell' THEN
        m.total_net - CASE WHEN b.total_qty > 0 THEN ROUND(b.total_amt::numeric / b.total_qty * m.total_qty) ELSE 0 END
      END), 0)::integer AS realized_gain
    FROM monthly m
    LEFT JOIN buy_avg b ON b.ticker = m.ticker
    GROUP BY m.month
    ORDER BY m.month
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
  const isMonthly = !!(from && to)

  // 1) 누적 매수 (ticker별) - 평균매수단가 계산용
  const cumBuyConditions = [
    eq(investmentTrades.assetId, assetId),
    eq(investmentTrades.tradeType, 'buy' as const),
  ]
  if (isMonthly) cumBuyConditions.push(lt(investmentTrades.date, to))

  const buyRowsPromise = db
    .select({
      ticker: investmentTrades.ticker,
      totalQuantity: sql<number>`sum(${investmentTrades.quantity})`.as('total_quantity'),
      totalAmount: sql<number>`sum(${investmentTrades.totalAmount})`.as('total_amount'),
    })
    .from(investmentTrades)
    .where(and(...cumBuyConditions))
    .groupBy(investmentTrades.ticker)

  // 2) 누적 매도 수량 (보유수량 계산용)
  const cumSellConditions = [
    eq(investmentTrades.assetId, assetId),
    eq(investmentTrades.tradeType, 'sell' as const),
  ]
  if (isMonthly) cumSellConditions.push(lt(investmentTrades.date, to))

  const cumSellPromise = db
    .select({
      totalQuantity: sql<number>`sum(${investmentTrades.quantity})`.as('total_quantity'),
    })
    .from(investmentTrades)
    .where(and(...cumSellConditions))

  // 3) 매도/배당 (ticker별) - 실현손익 계산
  const sellDivConditions = [
    eq(investmentTrades.assetId, assetId),
    sql`${investmentTrades.tradeType} IN ('sell', 'dividend')`,
  ]
  if (isMonthly) {
    sellDivConditions.push(gte(investmentTrades.date, from))
    sellDivConditions.push(lt(investmentTrades.date, to))
  }

  const sellDivPromise = db
    .select({
      ticker: investmentTrades.ticker,
      tradeType: investmentTrades.tradeType,
      totalQuantity: sql<number>`sum(${investmentTrades.quantity})`.as('total_quantity'),
      totalNetAmount: sql<number>`sum(${investmentTrades.netAmount})`.as('total_net_amount'),
    })
    .from(investmentTrades)
    .where(and(...sellDivConditions))
    .groupBy(investmentTrades.ticker, investmentTrades.tradeType)

  // 4) 자산 정보
  const assetPromise = db.select().from(assets).where(eq(assets.id, assetId))

  const [buyRows, cumSellRows, sellDivRows, assetRows] = await Promise.all([
    buyRowsPromise, cumSellPromise, sellDivPromise, assetPromise,
  ])

  // ticker별 평균매수단가 맵
  const tickerAvgPrice = new Map<string | null, number>()
  let totalBought = 0
  let buyQuantity = 0
  for (const row of buyRows) {
    const qty = Number(row.totalQuantity) || 0
    const amt = Number(row.totalAmount) || 0
    tickerAvgPrice.set(row.ticker, qty > 0 ? amt / qty : 0)
    totalBought += amt
    buyQuantity += qty
  }

  const allSellQuantity = Number(cumSellRows[0]?.totalQuantity) || 0
  const totalQuantity = buyQuantity - allSellQuantity
  const avgBuyPrice = buyQuantity > 0 ? Math.round(totalBought / buyQuantity) : 0

  // ticker별 실현손익 합산
  let totalSold = 0
  let totalDividend = 0
  let realizedGain = 0

  for (const row of sellDivRows) {
    const netAmount = Number(row.totalNetAmount) || 0
    const qty = Number(row.totalQuantity) || 0
    if (row.tradeType === 'sell') {
      totalSold += netAmount
      const avgPrice = tickerAvgPrice.get(row.ticker) ?? 0
      realizedGain += Math.round(netAmount - (avgPrice * qty))
    } else if (row.tradeType === 'dividend') {
      totalDividend += netAmount
    }
  }

  const asset = assetRows[0]

  // 총 수익률: (실현손익 + 배당금) / 총매수액 × 100
  const totalReturn = totalBought > 0
    ? Math.round(((realizedGain + totalDividend) / totalBought) * 10000) / 100
    : 0

  return {
    assetId,
    assetName: asset?.name ?? '(삭제된 자산)',
    totalBought,
    totalSold,
    totalDividend,
    totalQuantity,
    avgBuyPrice,
    realizedGain,
    totalReturn,
  }
}
