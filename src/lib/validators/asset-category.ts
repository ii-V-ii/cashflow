import { z } from "zod"

const assetCategoryCore = z.object({
  name: z.string().min(1, "카테고리 이름을 입력하세요").max(50),
  kind: z.enum(["financial", "non_financial"]),
  icon: z.string().max(50).nullish(),
  color: z.string().max(30).nullish(),
  sortOrder: z.number().int().min(0),
})

/** POST /asset-categories (API.md §10.2) */
export const createAssetCategorySchema = assetCategoryCore.extend({
  sortOrder: z.number().int().min(0).default(0),
})

/** PATCH /asset-categories/{id} — partial (API.md §10.3) */
export const updateAssetCategorySchema = assetCategoryCore.partial().strip()

export type CreateAssetCategoryInput = z.infer<typeof createAssetCategorySchema>
export type UpdateAssetCategoryInput = z.infer<typeof updateAssetCategorySchema>
