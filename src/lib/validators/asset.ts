import { z } from "zod"

import { dateString, krwAmount } from "./common"

const assetKind = z.enum(["financial", "non_financial"])

const assetCore = z.object({
  name: z.string().min(1, "자산 이름을 입력하세요").max(100),
  assetCategoryId: z.uuid(),
  acquisitionDate: dateString,
  acquisitionCost: krwAmount.min(0),
  institution: z.string().max(100).nullish(),
  memo: z.string().max(500).nullish(),
  isActive: z.boolean(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
})

/** POST /assets — initialValue는 최초 평가이력 1건으로 변환 (API.md §9.2) */
export const createAssetSchema = assetCore.extend({
  isActive: z.boolean().default(true),
  initialValue: krwAmount.min(0).optional(),
})

/** PATCH /assets/{id} — 9.2 partial, 평가값 변경은 §9.7로 (initialValue 불허) */
export const updateAssetSchema = assetCore.partial().strip()

/** GET /assets 쿼리 (API.md §9.1) */
export const listAssetsQuerySchema = z.object({
  kind: assetKind.optional(),
  activeOnly: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
})

/**
 * POST /assets/{id}/valuations (API.md §9.7).
 * source='auto'는 pg_cron 스냅샷 전용 — 클라이언트 입력 불허.
 */
export const createValuationSchema = z.object({
  date: dateString,
  value: krwAmount.min(0),
  source: z.enum(["manual", "api", "estimate"]).default("manual"),
  memo: z.string().max(500).nullish(),
})

export type CreateAssetInput = z.infer<typeof createAssetSchema>
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>
export type ListAssetsQuery = z.infer<typeof listAssetsQuerySchema>
export type CreateValuationInput = z.infer<typeof createValuationSchema>
