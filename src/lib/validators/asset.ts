import { z } from 'zod'

export const createAssetSchema = z.object({
  name: z.string().min(1).max(100),
  assetCategoryId: z.string().min(1),
  acquisitionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  acquisitionCost: z.number().int().min(0),
  currentValue: z.number().int().min(0),
  accountId: z.string().nullable().optional().default(null),
  institution: z.string().max(100).nullable().optional().default(null),
  memo: z.string().max(500).nullable().optional().default(null),
  isActive: z.boolean().optional().default(true),
  metadata: z.record(z.string(), z.unknown()).nullable().optional().default(null),
})

export const updateAssetSchema = createAssetSchema.partial()

export const createValuationSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  value: z.number().int().min(0),
  source: z.enum(['manual', 'api', 'estimate', 'auto']).optional().default('manual'),
  memo: z.string().max(500).nullable().optional().default(null),
})

export type CreateAssetInput = z.infer<typeof createAssetSchema>
export type CreateAssetFormInput = z.input<typeof createAssetSchema>
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>
export type CreateValuationInput = z.infer<typeof createValuationSchema>
export type CreateValuationFormInput = z.input<typeof createValuationSchema>
