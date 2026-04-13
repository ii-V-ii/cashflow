import { z } from 'zod'

const baseTransactionSchema = z.object({
  type: z.enum(['income', 'expense', 'transfer']),
  amount: z.number().int().positive(),
  description: z.string().min(1).max(200),
  categoryId: z.string().min(1).nullable().optional().default(null),
  accountId: z.string().min(1),
  toAccountId: z.string().min(1).nullable().optional().default(null),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  memo: z.string().max(500).nullable().optional().default(null),
  tags: z.array(z.string()).optional().default([]),
})

export const createTransactionSchema = baseTransactionSchema.refine(
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

export const updateTransactionSchema = baseTransactionSchema.partial().refine(
  (data) => {
    if (data.amount !== undefined && data.amount <= 0) return false
    return true
  },
  { message: '금액은 양수여야 합니다', path: ['amount'] },
)

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>
