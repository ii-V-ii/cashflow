import { getTableColumns, getTableName, getViewName } from "drizzle-orm"
import { describe, expect, expectTypeOf, test } from "vitest"

import {
  accountBalancesV,
  accounts,
  categories,
  tags,
  transactions,
  transactionTags,
  type Account,
  type AccountBalance,
  type Category,
  type Transaction,
} from "@/server/db/schema"

/**
 * Drizzle 스키마는 타입·쿼리빌더용 — 마이그레이션 SQL이 진실 (docs/DB.md 부록 A).
 * 여기서는 SQL 스키마와의 이름/컬럼 매핑 일치를 검증한다.
 */
describe("drizzle schema ↔ SQL migration mapping", () => {
  test("maps table names to the SQL schema", () => {
    expect(getTableName(categories)).toBe("categories")
    expect(getTableName(accounts)).toBe("accounts")
    expect(getTableName(tags)).toBe("tags")
    expect(getTableName(transactions)).toBe("transactions")
    expect(getTableName(transactionTags)).toBe("transaction_tags")
  })

  test("maps camelCase properties to snake_case columns", () => {
    const tx = getTableColumns(transactions)
    expect(tx.categoryId.name).toBe("category_id")
    expect(tx.accountId.name).toBe("account_id")
    expect(tx.toAccountId.name).toBe("to_account_id")
    expect(tx.recurringId.name).toBe("recurring_id")
    expect(tx.installmentMonths.name).toBe("installment_months")

    const cat = getTableColumns(categories)
    expect(cat.expenseKind.name).toBe("expense_kind")
    expect(cat.parentId.name).toBe("parent_id")

    const acc = getTableColumns(accounts)
    expect(acc.initialBalance.name).toBe("initial_balance")
    expect(acc.linkedAccountId.name).toBe("linked_account_id")
  })

  test("amount columns are bigint in number mode (KRW 정수 규약)", () => {
    const tx = getTableColumns(transactions)
    expect(tx.amount.getSQLType()).toBe("bigint")
    expect(tx.amount.notNull).toBe(true)

    const acc = getTableColumns(accounts)
    expect(acc.initialBalance.getSQLType()).toBe("bigint")
  })

  test("account_balances_v view is mapped as existing (마이그레이션이 소유)", () => {
    expect(getViewName(accountBalancesV)).toBe("account_balances_v")
  })

  test("exports row types for downstream layers", () => {
    expectTypeOf<Transaction>().toHaveProperty("id").toEqualTypeOf<string>()
    expectTypeOf<Transaction>().toHaveProperty("amount").toEqualTypeOf<number>()
    expectTypeOf<Transaction>()
      .toHaveProperty("type")
      .toEqualTypeOf<"income" | "expense" | "transfer">()
    expectTypeOf<Transaction>()
      .toHaveProperty("status")
      .toEqualTypeOf<"pending" | "applied">()
    expectTypeOf<Category>()
      .toHaveProperty("expenseKind")
      .toEqualTypeOf<"consumption" | "saving" | null>()
    expectTypeOf<Account>().toHaveProperty("initialBalance").toEqualTypeOf<number>()
    expectTypeOf<AccountBalance>()
      .toHaveProperty("currentBalance")
      .toEqualTypeOf<number>()
  })
})
