import { z } from 'zod'

export const createAccountSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['cash', 'bank', 'card', 'savings', 'investment']),
  balance: z.number().int().optional().default(0),
  color: z.string().max(20).nullable().optional().default(null),
  icon: z.string().max(50).nullable().optional().default(null),
})

export const updateAccountSchema = createAccountSchema.partial()

export type CreateAccountInput = z.infer<typeof createAccountSchema>
export type CreateAccountFormInput = z.input<typeof createAccountSchema>
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>
