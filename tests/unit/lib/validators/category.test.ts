import { describe, expect, test } from "vitest"

import {
  createCategorySchema,
  listCategoriesQuerySchema,
  updateCategorySchema,
} from "@/lib/validators/category"

const UUID_A = "11111111-1111-4111-8111-111111111111"

describe("createCategorySchema", () => {
  test("expense category requires expenseKind", () => {
    expect(
      createCategorySchema.safeParse({ name: "식비", type: "expense" }).success,
    ).toBe(false)
    expect(
      createCategorySchema.safeParse({
        name: "식비",
        type: "expense",
        expenseKind: "consumption",
      }).success,
    ).toBe(true)
  })

  test("income category must not have expenseKind", () => {
    expect(
      createCategorySchema.safeParse({
        name: "급여",
        type: "income",
        expenseKind: "consumption",
      }).success,
    ).toBe(false)
    expect(
      createCategorySchema.safeParse({ name: "급여", type: "income" }).success,
    ).toBe(true)
  })

  test("rejects empty or >50 char name", () => {
    expect(
      createCategorySchema.safeParse({
        name: "",
        type: "expense",
        expenseKind: "consumption",
      }).success,
    ).toBe(false)
    expect(
      createCategorySchema.safeParse({
        name: "가".repeat(51),
        type: "expense",
        expenseKind: "consumption",
      }).success,
    ).toBe(false)
  })

  test("accepts parentId + sortOrder", () => {
    expect(
      createCategorySchema.safeParse({
        name: "외식",
        type: "expense",
        expenseKind: "consumption",
        parentId: UUID_A,
        sortOrder: 3,
      }).success,
    ).toBe(true)
  })
})

describe("updateCategorySchema", () => {
  test("accepts partial body", () => {
    expect(updateCategorySchema.safeParse({ name: "새이름" }).success).toBe(true)
    expect(updateCategorySchema.safeParse({}).success).toBe(true)
  })
})

describe("listCategoriesQuerySchema", () => {
  test("parses grouped flag", () => {
    expect(listCategoriesQuerySchema.parse({ grouped: "true" }).grouped).toBe(
      true,
    )
    expect(listCategoriesQuerySchema.parse({}).grouped).toBe(false)
  })

  test("rejects unknown type", () => {
    expect(listCategoriesQuerySchema.safeParse({ type: "asset" }).success).toBe(
      false,
    )
  })
})
