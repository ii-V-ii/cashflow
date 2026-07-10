import { describe, expect, test } from "vitest"

import {
  createAccountSchema,
  reorderSchema,
  updateAccountSchema,
} from "@/lib/validators/account"

const UUID_A = "11111111-1111-4111-8111-111111111111"

describe("createAccountSchema", () => {
  test("accepts minimal bank account and defaults balance to 0", () => {
    const parsed = createAccountSchema.parse({ name: "국민은행", type: "bank" })
    expect(parsed.balance).toBe(0)
  })

  test("rejects empty or >100 char name", () => {
    expect(createAccountSchema.safeParse({ name: "", type: "bank" }).success).toBe(false)
    expect(
      createAccountSchema.safeParse({ name: "가".repeat(101), type: "bank" })
        .success,
    ).toBe(false)
  })

  test("rejects unknown account type", () => {
    expect(
      createAccountSchema.safeParse({ name: "x", type: "crypto" }).success,
    ).toBe(false)
  })

  test("billingDay must be 1~31", () => {
    expect(
      createAccountSchema.safeParse({ name: "카드", type: "card", billingDay: 0 })
        .success,
    ).toBe(false)
    expect(
      createAccountSchema.safeParse({ name: "카드", type: "card", billingDay: 32 })
        .success,
    ).toBe(false)
    expect(
      createAccountSchema.safeParse({ name: "카드", type: "card", billingDay: 25 })
        .success,
    ).toBe(true)
  })

  test("caps monetary fields at 10조 (SEC-M2)", () => {
    const MAX_KRW = 10_000_000_000_000
    expect(
      createAccountSchema.safeParse({
        name: "은행",
        type: "bank",
        balance: MAX_KRW + 1,
      }).success,
    ).toBe(false)
    expect(
      createAccountSchema.safeParse({
        name: "카드",
        type: "card",
        creditLimit: MAX_KRW + 1,
      }).success,
    ).toBe(false)
    expect(
      createAccountSchema.safeParse({
        name: "적금",
        type: "savings",
        monthlyPayment: MAX_KRW + 1,
      }).success,
    ).toBe(false)
    expect(
      updateAccountSchema.safeParse({ initialBalance: MAX_KRW + 1 }).success,
    ).toBe(false)
  })

  test("accepts savings fields", () => {
    expect(
      createAccountSchema.safeParse({
        name: "적금",
        type: "savings",
        depositType: "installment",
        termMonths: 12,
        interestRate: 3.5,
        taxType: "normal",
        openDate: "2026-01-01",
        monthlyPayment: 100000,
      }).success,
    ).toBe(true)
  })
})

describe("updateAccountSchema", () => {
  test("accepts partial body with initialBalance", () => {
    expect(
      updateAccountSchema.safeParse({ initialBalance: 5000 }).success,
    ).toBe(true)
    expect(updateAccountSchema.safeParse({}).success).toBe(true)
  })

  test("rejects balance key (derived, read-only)", () => {
    const parsed = updateAccountSchema.parse({ name: "새이름" })
    expect(parsed).not.toHaveProperty("balance")
  })
})

describe("reorderSchema", () => {
  test("requires at least one item", () => {
    expect(reorderSchema.safeParse({ items: [] }).success).toBe(false)
  })

  test("accepts uuid + sortOrder pairs", () => {
    expect(
      reorderSchema.safeParse({ items: [{ id: UUID_A, sortOrder: 2 }] })
        .success,
    ).toBe(true)
  })

  test("rejects negative sortOrder", () => {
    expect(
      reorderSchema.safeParse({ items: [{ id: UUID_A, sortOrder: -1 }] })
        .success,
    ).toBe(false)
  })
})
