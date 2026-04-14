import { z } from 'zod'

export const createAccountSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['cash', 'bank', 'card', 'savings', 'investment']),
  balance: z.number().int().optional().default(0),
  color: z.string().max(20).nullable().optional().default(null),
  icon: z.string().max(50).nullable().optional().default(null),
  depositType: z.enum(['lump_sum', 'installment']).nullable().optional().default(null),
  termMonths: z.number().int().positive().nullable().optional().default(null),
  interestRate: z.number().min(0).nullable().optional().default(null),
  taxType: z.enum(['normal', 'preferential', 'tax_free', 'high']).nullable().optional().default(null),
  openDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().default(null),
  monthlyPayment: z.number().int().positive().nullable().optional().default(null),
  assetId: z.string().nullable().optional().default(null),
})

export const updateAccountSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.enum(['cash', 'bank', 'card', 'savings', 'investment']).optional(),
  balance: z.number().int().optional(),
  color: z.string().max(20).nullable().optional(),
  icon: z.string().max(50).nullable().optional(),
  depositType: z.enum(['lump_sum', 'installment']).nullable().optional(),
  termMonths: z.number().int().positive().nullable().optional(),
  interestRate: z.number().min(0).nullable().optional(),
  taxType: z.enum(['normal', 'preferential', 'tax_free', 'high']).nullable().optional(),
  openDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  monthlyPayment: z.number().int().positive().nullable().optional(),
  assetId: z.string().nullable().optional(),
})

export type CreateAccountInput = z.infer<typeof createAccountSchema>
export type CreateAccountFormInput = z.input<typeof createAccountSchema>
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>
