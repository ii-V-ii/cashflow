import { z } from 'zod'

export const createInvestmentReturnSchema = z.object({
  assetId: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  investedAmount: z.number().int().optional().default(0),
  dividendIncome: z.number().int().optional().default(0),
  realizedGain: z.number().int().optional().default(0),
  unrealizedGain: z.number().int().optional().default(0),
  returnRate: z.number().nullable().optional().default(null),
  memo: z.string().max(500).nullable().optional().default(null),
})

export const updateInvestmentReturnSchema = createInvestmentReturnSchema.partial().omit({
  assetId: true,
  year: true,
  month: true,
})

export type CreateInvestmentReturnInput = z.infer<typeof createInvestmentReturnSchema>
export type UpdateInvestmentReturnInput = z.infer<typeof updateInvestmentReturnSchema>
