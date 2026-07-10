import { z } from "zod"

/** GET /tags 쿼리 — q 부분 일치 검색 (API.md §5.1) */
export const listTagsQuerySchema = z.object({
  q: z.string().max(50).optional(),
})

export type ListTagsQuery = z.infer<typeof listTagsQuerySchema>
