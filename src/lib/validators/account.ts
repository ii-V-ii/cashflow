import { z } from "zod"

import { dateString, krwAmount } from "./common"

export { reorderSchema } from "./common"

const accountType = z.enum(["cash", "bank", "card", "savings", "investment"])

const accountCore = z.object({
  name: z.string().min(1, "계좌 이름을 입력하세요").max(100),
  type: accountType,
  color: z.string().max(30).nullish(),
  icon: z.string().max(50).nullish(),
  // 적금(savings) 전용
  depositType: z.enum(["lump_sum", "installment"]).nullish(),
  termMonths: z.number().int().positive().nullish(),
  interestRate: z.number().min(0).max(100).nullish(),
  taxType: z.enum(["normal", "preferential", "tax_free", "high"]).nullish(),
  openDate: dateString.nullish(),
  monthlyPayment: krwAmount.min(0).nullish(),
  // 카드(card) 전용
  billingDay: z.number().int().min(1).max(31).nullish(),
  creditLimit: krwAmount.min(0).nullish(),
  linkedAccountId: z.uuid().nullish(),
  assetId: z.uuid().nullish(),
})

/** POST /accounts 본문 — balance는 initialBalance로 저장 (API.md §3.2) */
export const createAccountSchema = accountCore.extend({
  balance: krwAmount.default(0),
})

/** PATCH /accounts/{id} — 3.2 partial + initialBalance (파생 balance 직접 수정 불가, API.md §3.4) */
export const updateAccountSchema = accountCore
  .extend({
    initialBalance: krwAmount,
    sortOrder: z.number().int().min(0),
    isActive: z.boolean(),
  })
  .partial()
  .strip()

export type CreateAccountInput = z.infer<typeof createAccountSchema>
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>
