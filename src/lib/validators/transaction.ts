import { z } from "zod"

import { dateString, krwAmount, paginationQuery } from "./common"

const transactionType = z.enum(["income", "expense", "transfer"])

const transactionCore = z.object({
  type: transactionType,
  amount: krwAmount.positive("금액은 0보다 커야 합니다"),
  description: z.string().min(1, "내용을 입력하세요").max(200),
  categoryId: z.uuid().nullish(),
  accountId: z.uuid(),
  toAccountId: z.uuid().nullish(),
  date: dateString,
  memo: z.string().max(500).nullish(),
  tags: z.array(z.string().min(1).max(50)).max(20).optional(),
  installmentMonths: z.number().int().min(2).max(60).nullish(),
  installmentCurrent: z.number().int().min(1).nullish(),
})

/** 이체는 입금 계좌 필수 + 출금 계좌와 상이 (API.md §2.2 refine) */
function refineTransfer(
  value: { type?: string; accountId?: string; toAccountId?: string | null },
  ctx: z.RefinementCtx,
): void {
  if (value.type === "transfer" && !value.toAccountId) {
    ctx.addIssue({
      code: "custom",
      path: ["toAccountId"],
      message: "이체는 입금 계좌가 필요합니다",
    })
  }
  if (
    value.accountId !== undefined &&
    value.toAccountId !== undefined &&
    value.toAccountId !== null &&
    value.accountId === value.toAccountId
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["toAccountId"],
      message: "출금 계좌와 입금 계좌가 같을 수 없습니다",
    })
  }
}

export const createTransactionSchema = transactionCore.superRefine(refineTransfer)

/** 2.2의 partial — 모든 필드 optional, amount는 있으면 양수 (API.md §2.4) */
export const updateTransactionSchema = transactionCore
  .partial()
  .superRefine(refineTransfer)

/** GET /transactions 쿼리 (API.md §2.1) */
export const listTransactionsQuerySchema = paginationQuery.extend({
  type: transactionType.optional(),
  categoryId: z.uuid().optional(),
  accountId: z.uuid().optional(),
  tags: z
    .string()
    .transform((value) =>
      value
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag !== ""),
    )
    .optional(),
  search: z.string().max(200).optional(),
  from: dateString.optional(),
  to: dateString.optional(),
})

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>
