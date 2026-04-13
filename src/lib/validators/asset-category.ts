import { z } from 'zod'

export const assetCategoryKindEnum = z.enum(['financial', 'non_financial'])

export const createAssetCategorySchema = z.object({
  name: z.string().min(1).max(50),
  kind: assetCategoryKindEnum,
  icon: z.string().max(50).nullable().optional().default(null),
  color: z.string().max(20).nullable().optional().default(null),
  sortOrder: z.number().int().min(0).optional().default(0),
})

export const updateAssetCategorySchema = createAssetCategorySchema.partial()

export type CreateAssetCategoryInput = z.input<typeof createAssetCategorySchema>
export type UpdateAssetCategoryInput = z.input<typeof updateAssetCategorySchema>
