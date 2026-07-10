import { describe, expect, test } from "vitest"

import {
  createTransactionSchema,
  listTransactionsQuerySchema,
  updateTransactionSchema,
} from "@/lib/validators/transaction"

const UUID_A = "11111111-1111-4111-8111-111111111111"
const UUID_B = "22222222-2222-4222-8222-222222222222"

const validBase = {
  type: "expense",
  amount: 12000,
  description: "점심",
  accountId: UUID_A,
  date: "2026-07-10",
}

describe("createTransactionSchema", () => {
  test("accepts a minimal expense", () => {
    const result = createTransactionSchema.safeParse(validBase)
    expect(result.success).toBe(true)
  })

  test("rejects zero/negative/decimal amount", () => {
    for (const amount of [0, -100, 10.5]) {
      expect(
        createTransactionSchema.safeParse({ ...validBase, amount }).success,
      ).toBe(false)
    }
  })

  test("rejects empty and >200 char description", () => {
    expect(
      createTransactionSchema.safeParse({ ...validBase, description: "" })
        .success,
    ).toBe(false)
    expect(
      createTransactionSchema.safeParse({
        ...validBase,
        description: "가".repeat(201),
      }).success,
    ).toBe(false)
  })

  test("rejects invalid date format", () => {
    expect(
      createTransactionSchema.safeParse({ ...validBase, date: "2026/07/10" })
        .success,
    ).toBe(false)
  })

  test("transfer requires toAccountId", () => {
    expect(
      createTransactionSchema.safeParse({ ...validBase, type: "transfer" })
        .success,
    ).toBe(false)
    expect(
      createTransactionSchema.safeParse({
        ...validBase,
        type: "transfer",
        toAccountId: UUID_B,
      }).success,
    ).toBe(true)
  })

  test("transfer rejects same from/to account", () => {
    expect(
      createTransactionSchema.safeParse({
        ...validBase,
        type: "transfer",
        toAccountId: UUID_A,
      }).success,
    ).toBe(false)
  })

  test("rejects memo over 500 chars", () => {
    expect(
      createTransactionSchema.safeParse({
        ...validBase,
        memo: "가".repeat(501),
      }).success,
    ).toBe(false)
  })

  test("installmentMonths must be 2~60", () => {
    expect(
      createTransactionSchema.safeParse({
        ...validBase,
        installmentMonths: 1,
      }).success,
    ).toBe(false)
    expect(
      createTransactionSchema.safeParse({
        ...validBase,
        installmentMonths: 61,
      }).success,
    ).toBe(false)
    expect(
      createTransactionSchema.safeParse({
        ...validBase,
        installmentMonths: 12,
        installmentCurrent: 1,
      }).success,
    ).toBe(true)
  })

  test("accepts tags array of names", () => {
    const result = createTransactionSchema.safeParse({
      ...validBase,
      tags: ["외식", "회사"],
    })
    expect(result.success).toBe(true)
  })
})

describe("updateTransactionSchema", () => {
  test("accepts partial body", () => {
    expect(updateTransactionSchema.safeParse({ amount: 500 }).success).toBe(
      true,
    )
    expect(updateTransactionSchema.safeParse({}).success).toBe(true)
  })

  test("amount, when present, must be positive int", () => {
    expect(updateTransactionSchema.safeParse({ amount: -1 }).success).toBe(
      false,
    )
  })

  test("rejects identical accountId/toAccountId pair", () => {
    expect(
      updateTransactionSchema.safeParse({
        accountId: UUID_A,
        toAccountId: UUID_A,
      }).success,
    ).toBe(false)
  })
})

describe("listTransactionsQuerySchema", () => {
  test("defaults page=1 limit=20", () => {
    const parsed = listTransactionsQuerySchema.parse({})
    expect(parsed.page).toBe(1)
    expect(parsed.limit).toBe(20)
  })

  test("coerces string numbers and caps limit at 100", () => {
    const parsed = listTransactionsQuerySchema.parse({ page: "3", limit: "50" })
    expect(parsed.page).toBe(3)
    expect(parsed.limit).toBe(50)
    expect(
      listTransactionsQuerySchema.safeParse({ limit: "101" }).success,
    ).toBe(false)
  })

  test("splits comma separated tags", () => {
    const parsed = listTransactionsQuerySchema.parse({ tags: "외식, 회사" })
    expect(parsed.tags).toEqual(["외식", "회사"])
  })

  test("rejects unknown type", () => {
    expect(
      listTransactionsQuerySchema.safeParse({ type: "loan" }).success,
    ).toBe(false)
  })
})
