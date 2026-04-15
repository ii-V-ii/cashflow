import { eq, sql, desc } from 'drizzle-orm'
import { getDb } from '../index'
import { investmentTrades, assets } from '../schema'
import { generateId } from '../../lib/utils'
import type { CreateInvestmentTradeInput, UpdateInvestmentTradeInput } from '../../lib/validators'

export async function findAllInvestmentTrades(assetId?: string) {
  const db = getDb()
  if (assetId) {
    return db
      .select()
      .from(investmentTrades)
      .where(eq(investmentTrades.assetId, assetId))
      .orderBy(desc(investmentTrades.date))
  }
  return db
    .select()
    .from(investmentTrades)
    .orderBy(desc(investmentTrades.date))
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

export async function getAssetTradeSummary(assetId: string) {
  const db = getDb()

  const rows = await db
    .select({
      tradeType: investmentTrades.tradeType,
      totalQuantity: sql<number>`sum(${investmentTrades.quantity})`.as('total_quantity'),
      totalAmount: sql<number>`sum(${investmentTrades.totalAmount})`.as('total_amount'),
      totalNetAmount: sql<number>`sum(${investmentTrades.netAmount})`.as('total_net_amount'),
      totalFee: sql<number>`sum(${investmentTrades.fee})`.as('total_fee'),
      totalTax: sql<number>`sum(${investmentTrades.tax})`.as('total_tax'),
    })
    .from(investmentTrades)
    .where(eq(investmentTrades.assetId, assetId))
    .groupBy(investmentTrades.tradeType)

  let totalBought = 0
  let totalSold = 0
  let totalDividend = 0
  let buyQuantity = 0
  let sellQuantity = 0

  for (const row of rows) {
    const amount = Number(row.totalAmount) || 0
    const netAmount = Number(row.totalNetAmount) || 0
    const qty = Number(row.totalQuantity) || 0

    if (row.tradeType === 'buy') {
      totalBought = amount
      buyQuantity = qty
    } else if (row.tradeType === 'sell') {
      totalSold = netAmount
      sellQuantity = qty
    } else if (row.tradeType === 'dividend') {
      totalDividend = netAmount
    }
  }

  const totalQuantity = buyQuantity - sellQuantity
  const avgBuyPrice = buyQuantity > 0 ? Math.round(totalBought / buyQuantity) : 0

  // 자산의 현재 가치 조회
  const assetRows = await db.select().from(assets).where(eq(assets.id, assetId))
  const asset = assetRows[0]
  const currentValue = asset?.currentValue ?? 0

  // 실현손익: 매도 수령액 - (평균매수단가 × 매도수량)
  const realizedGain = totalSold - (avgBuyPrice * sellQuantity)

  // 미실현손익: 현재가치 - (평균매수단가 × 보유수량)
  const unrealizedGain = totalQuantity > 0
    ? currentValue - (avgBuyPrice * totalQuantity)
    : 0

  // 총 수익률: (실현손익 + 미실현손익 + 배당금) / 총매수액 × 100
  const totalReturn = totalBought > 0
    ? Math.round(((realizedGain + unrealizedGain + totalDividend) / totalBought) * 10000) / 100
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
    unrealizedGain,
    totalReturn,
  }
}
