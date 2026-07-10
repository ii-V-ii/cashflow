import { z } from "zod"

import { dateString, krwAmount } from "./common"

const recurringFrequency = z.enum(["daily", "weekly", "monthly", "yearly"])

/**
 * 시작일 하한 (REV-H2): 과거로 무한정 열어두면 create/update_recurring의
 * next_date 전개 루프가 O(경과 기간)으로 폭주한다 — SQL 측 반복 상한과 이중 방어.
 */
export const MIN_RECURRING_START_DATE = "1990-01-01"

const recurringCore = z.object({
  type: z.enum(["income", "expense", "transfer"]),
  amount: krwAmount.positive("금액은 0보다 커야 합니다"),
  description: z.string().min(1, "내용을 입력하세요").max(200),
  categoryId: z.uuid().nullish(),
  accountId: z.uuid(),
  toAccountId: z.uuid().nullish(),
  frequency: recurringFrequency,
  interval: z.number().int().min(1).max(365).default(1),
  startDate: dateString,
  endDate: dateString.nullish(),
})

/** 이체 refine + 기간 순서 (API.md §12.2 refine) */
function refineRecurring(
  value: {
    type?: string
    accountId?: string
    toAccountId?: string | null
    startDate?: string
    endDate?: string | null
  },
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
  if (
    value.startDate !== undefined &&
    value.endDate !== undefined &&
    value.endDate !== null &&
    value.endDate < value.startDate
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["endDate"],
      message: "종료일은 시작일 이후여야 합니다",
    })
  }
  if (value.startDate !== undefined && value.startDate < MIN_RECURRING_START_DATE) {
    ctx.addIssue({
      code: "custom",
      path: ["startDate"],
      message: `시작일은 ${MIN_RECURRING_START_DATE} 이후여야 합니다`,
    })
  }
}

/** POST /recurring 본문 (API.md §12.2) */
export const createRecurringSchema = recurringCore.superRefine(refineRecurring)

/** PATCH /recurring/{id} 본문 — §12.2 partial + isActive (API.md §12.4) */
export const updateRecurringSchema = recurringCore
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .superRefine(refineRecurring)

export type CreateRecurringInput = z.infer<typeof createRecurringSchema>
export type UpdateRecurringInput = z.infer<typeof updateRecurringSchema>
