import { eq } from 'drizzle-orm'
import {
  findInvestmentReturnById,
  findInvestmentReturnsByPeriod,
  findInvestmentReturnsByAssetId,
  findInvestmentReturnsByAssetAndPeriod,
  createInvestmentReturn,
  updateInvestmentReturn,
  deleteInvestmentReturn,
  findAssetById,
  findAllAssets,
  findAllInvestmentTrades,
  findInvestmentTradeById,
  updateInvestmentTrade as updateInvestmentTradeRepo,
  getAssetTradeSummary,
  updateAccountBalance,
  findAccountById,
  syncAssetFromAccount,
} from '@/db/repositories'
import { getDb } from '@/db'
import { investmentTrades } from '@/db/schema'
import { generateId } from '@/lib/utils'
import {
  createInvestmentReturnSchema,
  updateInvestmentReturnSchema,
  createInvestmentTradeSchema,
  updateInvestmentTradeSchema,
} from '@/lib/validators'
import { successResponse, errorResponse } from '@/lib/api-response'
import type { ApiResponse, InvestmentSummary, AssetReturnSummary, AssetInvestmentSummary } from '@/types'

export async function getInvestmentReturnsService(params?: {
  year?: number
  month?: number
  assetId?: string
}): Promise<ApiResponse<Awaited<ReturnType<typeof findInvestmentReturnsByPeriod>>>> {
  if (params?.assetId && params?.year) {
    return successResponse(
      await findInvestmentReturnsByAssetAndPeriod(params.assetId, params.year, params.month),
    )
  }
  if (params?.assetId) {
    return successResponse(await findInvestmentReturnsByAssetId(params.assetId))
  }
  if (params?.year) {
    return successResponse(await findInvestmentReturnsByPeriod(params.year, params.month))
  }
  return successResponse(await findInvestmentReturnsByPeriod(new Date().getFullYear()))
}

export async function getInvestmentReturnByIdService(
  id: string,
): Promise<ApiResponse<Awaited<ReturnType<typeof findInvestmentReturnById>>>> {
  const record = await findInvestmentReturnById(id)
  if (!record) {
    return errorResponse('NOT_FOUND', '투자 수익 기록을 찾을 수 없습니다')
  }
  return successResponse(record)
}

export async function createInvestmentReturnService(
  input: unknown,
): Promise<ApiResponse<Awaited<ReturnType<typeof findInvestmentReturnById>>>> {
  const parsed = createInvestmentReturnSchema.safeParse(input)
  if (!parsed.success) {
    return errorResponse('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다')
  }

  const asset = await findAssetById(parsed.data.assetId)
  if (!asset) {
    return errorResponse('ASSET_NOT_FOUND', '자산을 찾을 수 없습니다')
  }

  const record = await createInvestmentReturn(parsed.data)
  return successResponse(record)
}

export async function updateInvestmentReturnService(
  id: string,
  input: unknown,
): Promise<ApiResponse<Awaited<ReturnType<typeof findInvestmentReturnById>>>> {
  const parsed = updateInvestmentReturnSchema.safeParse(input)
  if (!parsed.success) {
    return errorResponse('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다')
  }

  const record = await updateInvestmentReturn(id, parsed.data)
  if (!record) {
    return errorResponse('NOT_FOUND', '투자 수익 기록을 찾을 수 없습니다')
  }
  return successResponse(record)
}

export async function deleteInvestmentReturnService(
  id: string,
): Promise<ApiResponse<{ deleted: true }>> {
  const deleted = await deleteInvestmentReturn(id)
  if (!deleted) {
    return errorResponse('NOT_FOUND', '투자 수익 기록을 찾을 수 없습니다')
  }
  return successResponse({ deleted: true })
}

export async function getInvestmentSummaryService(
  year: number,
): Promise<ApiResponse<InvestmentSummary>> {
  const returns = await findInvestmentReturnsByPeriod(year)
  const allAssets = await findAllAssets(true)

  const assetMap = new Map(allAssets.map((a) => [a.id, a]))

  // 자산별 집계
  const byAssetMap = new Map<
    string,
    {
      investedAmount: number
      dividendIncome: number
      realizedGain: number
      unrealizedGain: number
      returnRates: number[]
    }
  >()

  for (const r of returns) {
    const existing = byAssetMap.get(r.assetId) ?? {
      investedAmount: 0,
      dividendIncome: 0,
      realizedGain: 0,
      unrealizedGain: 0,
      returnRates: [],
    }
    byAssetMap.set(r.assetId, {
      investedAmount: existing.investedAmount + (r.investedAmount ?? 0),
      dividendIncome: existing.dividendIncome + (r.dividendIncome ?? 0),
      realizedGain: existing.realizedGain + (r.realizedGain ?? 0),
      unrealizedGain: existing.unrealizedGain + (r.unrealizedGain ?? 0),
      returnRates: r.returnRate != null
        ? [...existing.returnRates, r.returnRate]
        : existing.returnRates,
    })
  }

  const byAsset: AssetReturnSummary[] = Array.from(byAssetMap.entries()).map(
    ([assetId, data]) => {
      const asset = assetMap.get(assetId)
      const avgRate =
        data.returnRates.length > 0
          ? data.returnRates.reduce((s, r) => s + r, 0) / data.returnRates.length
          : 0

      return {
        assetId,
        assetName: asset?.name ?? '(삭제된 자산)',
        totalInvestedAmount: data.investedAmount,
        totalDividendIncome: data.dividendIncome,
        totalRealizedGain: data.realizedGain,
        totalUnrealizedGain: data.unrealizedGain,
        averageReturnRate: Math.round(avgRate * 100) / 100,
      }
    },
  )

  const totalInvestedAmount = byAsset.reduce((s, a) => s + a.totalInvestedAmount, 0)
  const totalDividendIncome = byAsset.reduce((s, a) => s + a.totalDividendIncome, 0)
  const totalRealizedGain = byAsset.reduce((s, a) => s + a.totalRealizedGain, 0)
  const totalUnrealizedGain = byAsset.reduce((s, a) => s + a.totalUnrealizedGain, 0)

  const allRates = returns
    .filter((r) => r.returnRate != null)
    .map((r) => r.returnRate as number)
  const averageReturnRate =
    allRates.length > 0
      ? Math.round((allRates.reduce((s, r) => s + r, 0) / allRates.length) * 100) / 100
      : 0

  return successResponse({
    year,
    totalInvestedAmount,
    totalDividendIncome,
    totalRealizedGain,
    totalUnrealizedGain,
    averageReturnRate,
    byAsset,
  })
}

// === Investment Trades ===

export async function getInvestmentTradesService(
  assetId?: string,
  from?: string,
  to?: string,
): Promise<ApiResponse<Awaited<ReturnType<typeof findAllInvestmentTrades>>>> {
  return successResponse(await findAllInvestmentTrades(assetId, from, to))
}

export async function getInvestmentTradeByIdService(
  id: string,
): Promise<ApiResponse<Awaited<ReturnType<typeof findInvestmentTradeById>>>> {
  const trade = await findInvestmentTradeById(id)
  if (!trade) {
    return errorResponse('NOT_FOUND', '매매 기록을 찾을 수 없습니다')
  }
  return successResponse(trade)
}

export async function createTradeService(
  input: unknown,
): Promise<ApiResponse<Awaited<ReturnType<typeof findInvestmentTradeById>>>> {
  const parsed = createInvestmentTradeSchema.safeParse(input)
  if (!parsed.success) {
    return errorResponse('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다')
  }

  const asset = await findAssetById(parsed.data.assetId)
  if (!asset) {
    return errorResponse('ASSET_NOT_FOUND', '자산을 찾을 수 없습니다')
  }

  if (parsed.data.accountId) {
    const account = await findAccountById(parsed.data.accountId)
    if (!account) {
      return errorResponse('ACCOUNT_NOT_FOUND', '계좌를 찾을 수 없습니다')
    }
  }

  const db = getDb()
  const id = generateId()

  await db.transaction(async (tx) => {
    await tx.insert(investmentTrades).values({
      id,
      assetId: parsed.data.assetId,
      tradeType: parsed.data.tradeType,
      date: parsed.data.date,
      ticker: parsed.data.ticker ?? null,
      quantity: parsed.data.quantity,
      unitPrice: parsed.data.unitPrice,
      totalAmount: parsed.data.totalAmount,
      fee: parsed.data.fee ?? 0,
      tax: parsed.data.tax ?? 0,
      netAmount: parsed.data.netAmount,
      memo: parsed.data.memo ?? null,
      accountId: parsed.data.accountId ?? null,
    })

    if (parsed.data.accountId) {
      const delta = parsed.data.tradeType === 'buy'
        ? -parsed.data.totalAmount
        : parsed.data.netAmount
      await updateAccountBalance(parsed.data.accountId, delta, tx)
      await syncAssetFromAccount(parsed.data.accountId, tx)
    }
  })

  return successResponse((await findInvestmentTradeById(id))!)
}

export async function updateTradeService(
  id: string,
  input: unknown,
): Promise<ApiResponse<Awaited<ReturnType<typeof findInvestmentTradeById>>>> {
  const parsed = updateInvestmentTradeSchema.safeParse(input)
  if (!parsed.success) {
    return errorResponse('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다')
  }

  const trade = await updateInvestmentTradeRepo(id, parsed.data)
  if (!trade) {
    return errorResponse('NOT_FOUND', '매매 기록을 찾을 수 없습니다')
  }
  return successResponse(trade)
}

export async function deleteTradeService(
  id: string,
): Promise<ApiResponse<{ deleted: true }>> {
  const trade = await findInvestmentTradeById(id)
  if (!trade) {
    return errorResponse('NOT_FOUND', '매매 기록을 찾을 수 없습니다')
  }

  const db = getDb()

  await db.transaction(async (tx) => {
    await tx.delete(investmentTrades).where(eq(investmentTrades.id, id))

    if (trade.accountId) {
      const delta = trade.tradeType === 'buy'
        ? trade.totalAmount
        : -trade.netAmount
      await updateAccountBalance(trade.accountId, delta, tx)
      await syncAssetFromAccount(trade.accountId, tx)
    }
  })

  return successResponse({ deleted: true })
}

export async function getAssetInvestmentSummaryService(
  assetId: string,
  from?: string,
  to?: string,
): Promise<ApiResponse<AssetInvestmentSummary>> {
  const asset = await findAssetById(assetId)
  if (!asset) {
    return errorResponse('ASSET_NOT_FOUND', '자산을 찾을 수 없습니다')
  }

  const summary = await getAssetTradeSummary(assetId, from, to)
  return successResponse(summary)
}
