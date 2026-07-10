import { describe, expect, test } from "vitest"

import {
  createRecurringSchema,
  updateRecurringSchema,
} from "@/lib/validators"

const UUID_A = "11111111-1111-4111-8111-111111111111"
const UUID_B = "22222222-2222-4222-8222-222222222222"

const validBase = {
  type: "expense" as const,
  amount: 50000,
  description: "월세",
  accountId: UUID_A,
  frequency: "monthly" as const,
  startDate: "2026-08-01",
}

describe("createRecurringSchema (API.md §12.2)", () => {
  test("유효한 최소 입력을 통과시키고 interval 기본값 1을 적용한다", () => {
    // Act
    const result = createRecurringSchema.parse(validBase)

    // Assert
    expect(result.interval).toBe(1)
    expect(result.type).toBe("expense")
  })

  test("전체 필드 입력을 통과시킨다", () => {
    const result = createRecurringSchema.parse({
      ...validBase,
      categoryId: UUID_B,
      interval: 2,
      endDate: "2027-08-01",
    })
    expect(result.endDate).toBe("2027-08-01")
  })

  test.each([
    ["amount 0", { ...validBase, amount: 0 }],
    ["amount 음수", { ...validBase, amount: -1000 }],
    ["amount 소수", { ...validBase, amount: 100.5 }],
    ["description 빈 문자열", { ...validBase, description: "" }],
    ["description 201자", { ...validBase, description: "a".repeat(201) }],
    ["interval 0", { ...validBase, interval: 0 }],
    ["interval 366", { ...validBase, interval: 366 }],
    ["잘못된 frequency", { ...validBase, frequency: "hourly" }],
    ["잘못된 날짜 형식", { ...validBase, startDate: "2026/08/01" }],
    ["존재하지 않는 달력 날짜", { ...validBase, startDate: "2026-02-30" }],
    ["비현실적으로 오래된 시작일", { ...validBase, startDate: "1989-12-31" }],
    ["accountId 누락", { ...validBase, accountId: undefined }],
  ])("%s 를 거부한다", (_name, input) => {
    expect(createRecurringSchema.safeParse(input).success).toBe(false)
  })

  test("이체는 toAccountId가 없으면 거부한다", () => {
    const result = createRecurringSchema.safeParse({
      ...validBase,
      type: "transfer",
    })
    expect(result.success).toBe(false)
  })

  test("이체는 출금·입금 계좌가 같으면 거부한다", () => {
    const result = createRecurringSchema.safeParse({
      ...validBase,
      type: "transfer",
      toAccountId: UUID_A,
    })
    expect(result.success).toBe(false)
  })

  test("이체는 상이한 toAccountId가 있으면 통과한다", () => {
    const result = createRecurringSchema.safeParse({
      ...validBase,
      type: "transfer",
      toAccountId: UUID_B,
    })
    expect(result.success).toBe(true)
  })

  test("endDate가 startDate보다 이르면 거부한다", () => {
    const result = createRecurringSchema.safeParse({
      ...validBase,
      endDate: "2026-07-31",
    })
    expect(result.success).toBe(false)
  })
})

describe("updateRecurringSchema (API.md §12.4)", () => {
  test("부분 입력(isActive만)을 통과시킨다", () => {
    const result = updateRecurringSchema.parse({ isActive: false })
    expect(result.isActive).toBe(false)
  })

  test("빈 객체도 통과한다 (전 필드 optional)", () => {
    expect(updateRecurringSchema.safeParse({}).success).toBe(true)
  })

  test("amount가 있으면 양수여야 한다", () => {
    expect(updateRecurringSchema.safeParse({ amount: 0 }).success).toBe(false)
    expect(updateRecurringSchema.safeParse({ amount: 1 }).success).toBe(true)
  })

  test("startDate·endDate가 함께 오면 순서를 검증한다", () => {
    const result = updateRecurringSchema.safeParse({
      startDate: "2026-08-01",
      endDate: "2026-07-01",
    })
    expect(result.success).toBe(false)
  })

  test("출금·입금 계좌가 같으면 거부한다", () => {
    const result = updateRecurringSchema.safeParse({
      accountId: UUID_A,
      toAccountId: UUID_A,
    })
    expect(result.success).toBe(false)
  })
})
