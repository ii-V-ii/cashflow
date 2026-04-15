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
