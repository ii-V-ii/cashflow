import { z } from 'zod'

export const createCategorySchema = z.object({
  name: z.string().min(1).max(50),
  type: z.enum(['income', 'expense']),
  expenseKind: z.enum(['consumption', 'saving']).nullable().optional().default(null),
  icon: z.string().max(50).nullable().optional().default(null),
  color: z.string().max(20).nullable().optional().default(null),
  parentId: z.string().min(1).nullable().optional().default(null),
  sortOrder: z.number().int().min(0).optional(),
})

// partial() does not strip .default(null), which causes fields to be reset on update.
// Re-define update schema with optional fields (no defaults) so only provided fields are updated.
export const updateCategorySchema = z.object({
  name: z.string().min(1).max(50).optional(),
  type: z.enum(['income', 'expense']).optional(),
  expenseKind: z.enum(['consumption', 'saving']).nullable().optional(),
  icon: z.string().max(50).nullable().optional(),
  color: z.string().max(20).nullable().optional(),
  parentId: z.string().min(1).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
})

export type CreateCategoryInput = z.infer<typeof createCategorySchema>
export type CreateCategoryFormInput = z.input<typeof createCategorySchema>
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>
