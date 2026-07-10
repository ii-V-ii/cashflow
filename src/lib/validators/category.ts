import { z } from "zod"

export { reorderSchema } from "./common"

const categoryType = z.enum(["income", "expense"])

const categoryCore = z.object({
  name: z.string().min(1, "카테고리 이름을 입력하세요").max(50),
  type: categoryType,
  expenseKind: z.enum(["consumption", "saving"]).nullish(),
  icon: z.string().max(50).nullish(),
  color: z.string().max(30).nullish(),
  parentId: z.uuid().nullish(),
  sortOrder: z.number().int().min(0).default(0),
})

/**
 * DB CHECK와 동일 규칙 (마이그레이션 chk_categories_expense_kind):
 * 지출 카테고리는 expenseKind 필수, 수입 카테고리는 금지.
 */
function refineExpenseKind(
  value: { type?: "income" | "expense"; expenseKind?: string | null },
  ctx: z.RefinementCtx,
): void {
  if (value.type === "expense" && !value.expenseKind) {
    ctx.addIssue({
      code: "custom",
      path: ["expenseKind"],
      message: "지출 카테고리는 소비/저축 구분이 필요합니다",
    })
  }
  if (value.type === "income" && value.expenseKind) {
    ctx.addIssue({
      code: "custom",
      path: ["expenseKind"],
      message: "수입 카테고리는 소비/저축 구분을 가질 수 없습니다",
    })
  }
}

export const createCategorySchema = categoryCore.superRefine(refineExpenseKind)

/** PATCH — 4.2 partial, 미전달 필드 보존 (API.md §4.3) */
export const updateCategorySchema = categoryCore
  .partial()
  .superRefine(refineExpenseKind)

/** GET /categories 쿼리 (API.md §4.1) */
export const listCategoriesQuerySchema = z.object({
  type: categoryType.optional(),
  grouped: z
    .string()
    .optional()
    .transform((value) => value === "true"),
})

/** 클라이언트 제출용(디폴트 적용 전) / 서버 파싱 결과(디폴트 적용 후) */
export type CreateCategoryInput = z.input<typeof createCategorySchema>
export type CreateCategoryParsed = z.output<typeof createCategorySchema>
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>
export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>
