import { z } from 'zod'

export const tradeTypeEnum = z.enum(['buy', 'sell', 'dividend'])

export const createInvestmentTradeSchema = z.object({
  assetId: z.string().min(1, '자산을 선택해주세요'),
  tradeType: tradeTypeEnum,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식이 올바르지 않습니다'),
  ticker: z.string().max(20).nullable().optional().default(null),
  quantity: z.number().positive('수량은 0보다 커야 합니다'),
  unitPrice: z.number().int().min(0, '단가는 0 이상이어야 합니다'),
  totalAmount: z.number().int().min(0, '총액은 0 이상이어야 합니다'),
  fee: z.number().int().min(0).optional().default(0),
  tax: z.number().int().min(0).optional().default(0),
  netAmount: z.number().int(),
  memo: z.string().max(500).nullable().optional().default(null),
  accountId: z.string().min(1).nullable().optional().default(null),
})

export const updateInvestmentTradeSchema = createInvestmentTradeSchema.partial()

export type CreateInvestmentTradeInput = z.infer<typeof createInvestmentTradeSchema>
export type UpdateInvestmentTradeInput = z.infer<typeof updateInvestmentTradeSchema>
