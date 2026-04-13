import { z } from 'zod'

export const createRecurringTransactionSchema = z
  .object({
    type: z.enum(['income', 'expense', 'transfer']),
    amount: z.number().int().positive(),
    description: z.string().min(1).max(200),
    categoryId: z.string().min(1).nullable().optional().default(null),
    accountId: z.string().min(1),
    toAccountId: z.string().min(1).nullable().optional().default(null),
    frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
    interval: z.number().int().min(1).max(365).optional().default(1),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional()
      .default(null),
  })
  .refine(
    (data) => {
      if (data.type === 'transfer') {
        return data.toAccountId != null && data.toAccountId !== data.accountId
      }
      return true
    },
    {
      message: '이체 시 다른 도착 계좌를 지정해야 합니다',
      path: ['toAccountId'],
    },
  )

export const updateRecurringTransactionSchema = z.object({
  type: z.enum(['income', 'expense', 'transfer']).optional(),
  amount: z.number().int().positive().optional(),
  description: z.string().min(1).max(200).optional(),
  categoryId: z.string().min(1).nullable().optional(),
  accountId: z.string().min(1).optional(),
  toAccountId: z.string().min(1).nullable().optional(),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']).optional(),
  interval: z.number().int().min(1).max(365).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  isActive: z.boolean().optional(),
})

export type CreateRecurringTransactionInput = z.infer<typeof createRecurringTransactionSchema>
export type UpdateRecurringTransactionInput = z.infer<typeof updateRecurringTransactionSchema>
