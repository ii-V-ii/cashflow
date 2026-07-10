import { describe, expect, test } from "vitest"

import {
  applyBalanceDeltas,
  balanceDeltas,
  insertMonthRow,
  isOptimisticId,
  makeOptimisticId,
  removeMonthRow,
  replaceMonthRow,
} from "@/lib/optimistic/transactions"

const A = "acc-a"
const B = "acc-b"

const accounts = [
  { id: A, balance: 100000 },
  { id: B, balance: 50000 },
]

describe("balanceDeltas (ARCHITECTURE.md §7 잔액 delta 표)", () => {
  test("income: +amount on accountId", () => {
    expect(
      balanceDeltas({ type: "income", amount: 1000, accountId: A, toAccountId: null }),
    ).toEqual([{ accountId: A, delta: 1000 }])
  })

  test("expense (일반 소비): -amount on accountId", () => {
    expect(
      balanceDeltas({ type: "expense", amount: 1000, accountId: A, toAccountId: null }),
    ).toEqual([{ accountId: A, delta: -1000 }])
  })

  test("expense + toAccountId (저축): -amount / +amount", () => {
    expect(
      balanceDeltas({ type: "expense", amount: 1000, accountId: A, toAccountId: B }),
    ).toEqual([
      { accountId: A, delta: -1000 },
      { accountId: B, delta: 1000 },
    ])
  })

  test("transfer: -amount / +amount", () => {
    expect(
      balanceDeltas({ type: "transfer", amount: 700, accountId: A, toAccountId: B }),
    ).toEqual([
      { accountId: A, delta: -700 },
      { accountId: B, delta: 700 },
    ])
  })
})

describe("applyBalanceDeltas", () => {
  const deltas = [
    { accountId: A, delta: -1000 },
    { accountId: B, delta: 1000 },
  ]

  test("returns a new array with adjusted balances (불변)", () => {
    const next = applyBalanceDeltas(accounts, deltas, 1)
    expect(next).not.toBe(accounts)
    expect(next[0].balance).toBe(99000)
    expect(next[1].balance).toBe(51000)
    expect(accounts[0].balance).toBe(100000)
  })

  test("sign=-1 reverses the delta (rollback/delete)", () => {
    const next = applyBalanceDeltas(accounts, deltas, -1)
    expect(next[0].balance).toBe(101000)
    expect(next[1].balance).toBe(49000)
  })

  test("ignores unknown account ids", () => {
    const next = applyBalanceDeltas(accounts, [{ accountId: "nope", delta: 5 }], 1)
    expect(next).toEqual(accounts)
  })
})

describe("month cache row operations", () => {
  const cache = {
    items: [
      { id: "t3", date: "2026-07-20" },
      { id: "t2", date: "2026-07-10" },
      { id: "t1", date: "2026-07-01" },
    ],
    total: 3,
    page: 1,
    limit: 100,
  }

  test("insertMonthRow keeps date DESC order and bumps total", () => {
    const next = insertMonthRow(cache, { id: "new", date: "2026-07-15" })!
    expect(next.items.map((item) => item.id)).toEqual(["t3", "new", "t2", "t1"])
    expect(next.total).toBe(4)
    expect(cache.items).toHaveLength(3)
  })

  test("insertMonthRow puts newest date first", () => {
    const next = insertMonthRow(cache, { id: "new", date: "2026-07-25" })!
    expect(next.items[0].id).toBe("new")
  })

  test("replaceMonthRow swaps a row by id", () => {
    const next = replaceMonthRow(cache, "t2", { id: "t2b", date: "2026-07-10" })!
    expect(next.items.map((item) => item.id)).toEqual(["t3", "t2b", "t1"])
    expect(next.total).toBe(3)
  })

  test("removeMonthRow drops a row and decrements total", () => {
    const next = removeMonthRow(cache, "t2")!
    expect(next.items.map((item) => item.id)).toEqual(["t3", "t1"])
    expect(next.total).toBe(2)
  })

  test("undefined cache passes through unchanged", () => {
    expect(insertMonthRow(undefined, { id: "x", date: "2026-07-01" })).toBeUndefined()
    expect(removeMonthRow(undefined, "x")).toBeUndefined()
    expect(replaceMonthRow(undefined, "x", { id: "y", date: "2026-07-01" })).toBeUndefined()
  })
})

describe("optimistic ids", () => {
  test("makeOptimisticId is prefixed and unique", () => {
    const one = makeOptimisticId()
    const two = makeOptimisticId()
    expect(one).toMatch(/^optimistic-/)
    expect(one).not.toBe(two)
  })

  test("isOptimisticId detects the prefix", () => {
    expect(isOptimisticId("optimistic-abc")).toBe(true)
    expect(isOptimisticId("11111111-1111-4111-8111-111111111111")).toBe(false)
  })
})
