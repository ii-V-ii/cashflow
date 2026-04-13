import { z } from 'zod'

const budgetItemSchema = z.object({
  categoryId: z.string().min(1),
  plannedAmount: z.number().int().min(0),
  memo: z.string().max(500).nullable().optional().default(null),
})

export const createBudgetSchema = z.object({
  name: z.string().min(1).max(100),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12).nullable().optional().default(null),
  totalIncome: z.number().int().min(0).optional().default(0),
  totalExpense: z.number().int().min(0).optional().default(0),
  memo: z.string().max(500).nullable().optional().default(null),
  items: z.array(budgetItemSchema).optional().default([]),
})

export const updateBudgetSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  totalIncome: z.number().int().min(0).optional(),
  totalExpense: z.number().int().min(0).optional(),
  memo: z.string().max(500).nullable().optional(),
  items: z.array(budgetItemSchema).optional(),
})

export const copyBudgetSchema = z.object({
  sourceYear: z.number().int().min(2000).max(2100),
  sourceMonth: z.number().int().min(1).max(12),
  targetYear: z.number().int().min(2000).max(2100),
  targetMonth: z.number().int().min(1).max(12),
})

export const updateAnnualGridCellSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  categoryId: z.string().min(1),
  amount: z.number().int().min(0),
})

export type UpdateAnnualGridCellInput = z.infer<typeof updateAnnualGridCellSchema>

export type CreateBudgetInput = z.infer<typeof createBudgetSchema>
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>
export type CopyBudgetInput = z.infer<typeof copyBudgetSchema>
export type BudgetItemInput = z.infer<typeof budgetItemSchema>
