import { afterAll, beforeEach, describe, expect, test } from "vitest"

import { callRpc, RpcError } from "@/server/rpc"
import { closeDb } from "@/server/db/client"

import { createTestDb, truncateTransactionCore } from "./helpers/db"

/**
 * Phase 1a 거래 코어 통합 테스트 (docs/DB.md §1, §2.1, §3.1-3.3 / PRD §5 규칙 1·2·5).
 * 로컬 Supabase(127.0.0.1:54322) 대상. 잔액은 전부 account_balances_v 파생값으로 검증한다.
 */
const sql = createTestDb()

afterAll(async () => {
  await sql.end()
  await closeDb()
})

beforeEach(async () => {
  await truncateTransactionCore(sql)
})

// ─── fixtures ────────────────────────────────────────────────

async function createAccount(
  name: string,
  initialBalance: number,
  type = "bank",
): Promise<string> {
  const rows = await sql`
    INSERT INTO public.accounts (name, type, initial_balance)
    VALUES (${name}, ${type}, ${initialBalance})
    RETURNING id
  `
  return rows[0].id as string
}

async function createCategory(
  name: string,
  type: "income" | "expense",
  expenseKind: "consumption" | "saving" | null = null,
  parentId: string | null = null,
): Promise<string> {
  const rows = await sql`
    INSERT INTO public.categories (name, type, expense_kind, parent_id)
    VALUES (${name}, ${type}, ${expenseKind}, ${parentId})
    RETURNING id
  `
  return rows[0].id as string
}

async function balanceOf(accountId: string): Promise<number> {
  const rows = await sql`
    SELECT current_balance FROM public.account_balances_v
    WHERE account_id = ${accountId}
  `
  expect(rows).toHaveLength(1)
  return Number(rows[0].current_balance)
}

async function onlyTransactionId(): Promise<string> {
  const rows = await sql`SELECT id FROM public.transactions`
  expect(rows).toHaveLength(1)
  return rows[0].id as string
}

interface TxPayload {
  type: "income" | "expense" | "transfer"
  amount: number
  description: string
  date: string
  account_id: string
  status?: "pending" | "applied"
  category_id?: string
  to_account_id?: string
  memo?: string
  tags?: string[]
}

function createTx(payload: TxPayload) {
  return callRpc("create_transaction", { p: payload })
}

// ─── create_transaction: 잔액 규칙 (PRD §5 규칙 2) ──────────

describe("create_transaction → account_balances_v", () => {
  test("income increases the account balance by amount", async () => {
    // Arrange
    const account = await createAccount("주계좌", 100_000)
    const category = await createCategory("급여", "income")

    // Act
    await createTx({
      type: "income",
      amount: 30_000,
      description: "7월 급여",
      date: "2026-07-01",
      account_id: account,
      category_id: category,
    })

    // Assert
    expect(await balanceOf(account)).toBe(130_000)
  })

  test("expense decreases the account balance by amount", async () => {
    const account = await createAccount("주계좌", 100_000)
    const category = await createCategory("식비", "expense", "consumption")

    await createTx({
      type: "expense",
      amount: 12_000,
      description: "점심",
      date: "2026-07-02",
      account_id: account,
      category_id: category,
    })

    expect(await balanceOf(account)).toBe(88_000)
  })

  test("transfer moves amount from account to to_account", async () => {
    const from = await createAccount("주계좌", 100_000)
    const to = await createAccount("비상금", 50_000)

    await createTx({
      type: "transfer",
      amount: 40_000,
      description: "비상금 이체",
      date: "2026-07-03",
      account_id: from,
      to_account_id: to,
    })

    expect(await balanceOf(from)).toBe(60_000)
    expect(await balanceOf(to)).toBe(90_000)
  })

  test("saving transaction (expense + saving category + to_account_id) credits the savings account", async () => {
    const from = await createAccount("주계좌", 100_000)
    const savings = await createAccount("적금", 0, "savings")
    const saving = await createCategory("저축", "expense", "saving")

    await createTx({
      type: "expense",
      amount: 25_000,
      description: "적금 납입",
      date: "2026-07-04",
      account_id: from,
      category_id: saving,
      to_account_id: savings,
    })

    expect(await balanceOf(from)).toBe(75_000)
    expect(await balanceOf(savings)).toBe(25_000)
  })

  test("rejects a saving-category expense without to_account_id", async () => {
    const from = await createAccount("주계좌", 100_000)
    const saving = await createCategory("저축", "expense", "saving")

    const promise = createTx({
      type: "expense",
      amount: 25_000,
      description: "적금 납입",
      date: "2026-07-04",
      account_id: from,
      category_id: saving,
    })

    await expect(promise).rejects.toBeInstanceOf(RpcError)
    await expect(promise).rejects.toMatchObject({ code: "CF422" })
    expect(await balanceOf(from)).toBe(100_000)
  })

  test("rejects a saving subcategory expense without to_account_id (parent expense_kind rollup)", async () => {
    const from = await createAccount("주계좌", 100_000)
    const parent = await createCategory("저축", "expense", "saving")
    const child = await createCategory("청년적금", "expense", "saving", parent)

    await expect(
      createTx({
        type: "expense",
        amount: 10_000,
        description: "청년적금",
        date: "2026-07-04",
        account_id: from,
        category_id: child,
      }),
    ).rejects.toMatchObject({ code: "CF422" })
  })

  test("rejects a consumption-category expense with to_account_id (역방향, DB-H1)", async () => {
    const from = await createAccount("주계좌", 100_000)
    const savings = await createAccount("적금", 0, "savings")
    const consumption = await createCategory("식비", "expense", "consumption")

    await expect(
      createTx({
        type: "expense",
        amount: 10_000,
        description: "잘못된 저축",
        date: "2026-07-04",
        account_id: from,
        category_id: consumption,
        to_account_id: savings,
      }),
    ).rejects.toMatchObject({ code: "CF422" })
    expect(await balanceOf(from)).toBe(100_000)
    expect(await balanceOf(savings)).toBe(0)
  })

  test("rejects an expense with to_account_id but no category (역방향, DB-H1)", async () => {
    const from = await createAccount("주계좌", 100_000)
    const savings = await createAccount("적금", 0, "savings")

    await expect(
      createTx({
        type: "expense",
        amount: 10_000,
        description: "카테고리 없는 저축",
        date: "2026-07-04",
        account_id: from,
        to_account_id: savings,
      }),
    ).rejects.toMatchObject({ code: "CF422" })
  })

  test("pending transactions are excluded from balances (applied-only aggregation)", async () => {
    const account = await createAccount("주계좌", 100_000)
    const category = await createCategory("식비", "expense", "consumption")

    await createTx({
      type: "expense",
      amount: 50_000,
      description: "미래 정기지출",
      date: "2026-08-01",
      account_id: account,
      category_id: category,
      status: "pending",
    })

    expect(await balanceOf(account)).toBe(100_000)
  })

  test("pending transfer credits neither side", async () => {
    const from = await createAccount("주계좌", 100_000)
    const to = await createAccount("비상금", 0)

    await createTx({
      type: "transfer",
      amount: 30_000,
      description: "예정 이체",
      date: "2026-08-01",
      account_id: from,
      to_account_id: to,
      status: "pending",
    })

    expect(await balanceOf(from)).toBe(100_000)
    expect(await balanceOf(to)).toBe(0)
  })
})

// ─── create_transaction: 태그 ────────────────────────────────

describe("create_transaction tags", () => {
  test("creates tags and links them to the transaction", async () => {
    const account = await createAccount("주계좌", 100_000)
    const category = await createCategory("식비", "expense", "consumption")

    await createTx({
      type: "expense",
      amount: 5_000,
      description: "커피",
      date: "2026-07-05",
      account_id: account,
      category_id: category,
      tags: ["커피", "외식"],
    })

    const txId = await onlyTransactionId()
    const tags = await sql`
      SELECT t.name FROM public.transaction_tags tt
      JOIN public.tags t ON t.id = tt.tag_id
      WHERE tt.transaction_id = ${txId}
      ORDER BY t.name
    `
    expect(tags.map((r) => r.name)).toEqual(["외식", "커피"])
  })

  test("reuses an existing tag with the same name instead of duplicating", async () => {
    const account = await createAccount("주계좌", 100_000)
    const category = await createCategory("식비", "expense", "consumption")

    await createTx({
      type: "expense",
      amount: 5_000,
      description: "커피 1",
      date: "2026-07-05",
      account_id: account,
      category_id: category,
      tags: ["커피"],
    })
    await createTx({
      type: "expense",
      amount: 4_500,
      description: "커피 2",
      date: "2026-07-06",
      account_id: account,
      category_id: category,
      tags: ["커피"],
    })

    const tagRows = await sql`SELECT id FROM public.tags WHERE name = ${"커피"}`
    expect(tagRows).toHaveLength(1)
    const links = await sql`
      SELECT transaction_id FROM public.transaction_tags
      WHERE tag_id = ${tagRows[0].id as string}
    `
    expect(links).toHaveLength(2)
  })
})

// ─── update_transaction ──────────────────────────────────────

describe("update_transaction", () => {
  test("amount change is reflected in the derived balance", async () => {
    const account = await createAccount("주계좌", 100_000)
    const category = await createCategory("식비", "expense", "consumption")
    await createTx({
      type: "expense",
      amount: 10_000,
      description: "점심",
      date: "2026-07-02",
      account_id: account,
      category_id: category,
    })
    const txId = await onlyTransactionId()

    await callRpc("update_transaction", { p_id: txId, p: { amount: 70_000 } })

    expect(await balanceOf(account)).toBe(30_000)
  })

  test("replaces the tag set when tags are provided", async () => {
    const account = await createAccount("주계좌", 100_000)
    const category = await createCategory("식비", "expense", "consumption")
    await createTx({
      type: "expense",
      amount: 5_000,
      description: "커피",
      date: "2026-07-05",
      account_id: account,
      category_id: category,
      tags: ["커피", "외식"],
    })
    const txId = await onlyTransactionId()

    await callRpc("update_transaction", {
      p_id: txId,
      p: { tags: ["기념일"] },
    })

    const tags = await sql`
      SELECT t.name FROM public.transaction_tags tt
      JOIN public.tags t ON t.id = tt.tag_id
      WHERE tt.transaction_id = ${txId}
    `
    expect(tags.map((r) => r.name)).toEqual(["기념일"])
    // 태그 마스터는 삭제하지 않는다 (다른 거래 재사용 대비)
    const allTags = await sql`SELECT name FROM public.tags`
    expect(allTags).toHaveLength(3)
  })

  test("promoting pending → applied makes the transaction count toward the balance", async () => {
    const account = await createAccount("주계좌", 100_000)
    const category = await createCategory("식비", "expense", "consumption")
    await createTx({
      type: "expense",
      amount: 20_000,
      description: "예정 지출",
      date: "2026-08-01",
      account_id: account,
      category_id: category,
      status: "pending",
    })
    const txId = await onlyTransactionId()
    expect(await balanceOf(account)).toBe(100_000)

    await callRpc("update_transaction", {
      p_id: txId,
      p: { status: "applied" },
    })

    expect(await balanceOf(account)).toBe(80_000)
  })

  test("rejects when the transaction does not exist", async () => {
    await expect(
      callRpc("update_transaction", {
        p_id: "00000000-0000-0000-0000-000000000000",
        p: { amount: 1 },
      }),
    ).rejects.toMatchObject({ code: "CF404" })
  })

  describe("저축 정합성 — 병합 후 최종 상태 기준 검증 (DB-H1)", () => {
    async function createSavingTx(): Promise<{
      txId: string
      from: string
      savings: string
      saving: string
      consumption: string
    }> {
      const from = await createAccount("주계좌", 100_000)
      const savings = await createAccount("적금", 0, "savings")
      const saving = await createCategory("저축", "expense", "saving")
      const consumption = await createCategory("식비", "expense", "consumption")
      await createTx({
        type: "expense",
        amount: 25_000,
        description: "적금 납입",
        date: "2026-07-04",
        account_id: from,
        category_id: saving,
        to_account_id: savings,
      })
      return { txId: await onlyTransactionId(), from, savings, saving, consumption }
    }

    test("rejects switching a saving tx to a consumption category (to_account 유지)", async () => {
      const { txId, consumption, from, savings } = await createSavingTx()

      await expect(
        callRpc("update_transaction", {
          p_id: txId,
          p: { category_id: consumption },
        }),
      ).rejects.toMatchObject({ code: "CF422" })
      // 예외로 UPDATE 전체가 롤백 — 잔액 불변
      expect(await balanceOf(from)).toBe(75_000)
      expect(await balanceOf(savings)).toBe(25_000)
    })

    test("rejects removing to_account_id from a saving tx", async () => {
      const { txId } = await createSavingTx()

      await expect(
        callRpc("update_transaction", {
          p_id: txId,
          p: { to_account_id: null },
        }),
      ).rejects.toMatchObject({ code: "CF422" })
    })

    test("rejects a partial PATCH that composes an invalid state (to_account만 추가)", async () => {
      const from = await createAccount("주계좌", 100_000)
      const savings = await createAccount("적금", 0, "savings")
      const consumption = await createCategory("식비", "expense", "consumption")
      await createTx({
        type: "expense",
        amount: 5_000,
        description: "점심",
        date: "2026-07-05",
        account_id: from,
        category_id: consumption,
      })
      const txId = await onlyTransactionId()

      await expect(
        callRpc("update_transaction", {
          p_id: txId,
          p: { to_account_id: savings },
        }),
      ).rejects.toMatchObject({ code: "CF422" })
    })

    test("accepts a normal partial update on a saving tx", async () => {
      const { txId, from, savings } = await createSavingTx()

      await callRpc("update_transaction", {
        p_id: txId,
        p: { amount: 30_000 },
      })

      expect(await balanceOf(from)).toBe(70_000)
      expect(await balanceOf(savings)).toBe(30_000)
    })
  })
})

// ─── delete_transaction ──────────────────────────────────────

describe("delete_transaction", () => {
  test("restores the derived balance and cascades transaction_tags", async () => {
    const from = await createAccount("주계좌", 100_000)
    const to = await createAccount("적금", 0, "savings")
    const saving = await createCategory("저축", "expense", "saving")
    await createTx({
      type: "expense",
      amount: 25_000,
      description: "적금 납입",
      date: "2026-07-04",
      account_id: from,
      category_id: saving,
      to_account_id: to,
      tags: ["저축습관"],
    })
    const txId = await onlyTransactionId()
    expect(await balanceOf(from)).toBe(75_000)
    expect(await balanceOf(to)).toBe(25_000)

    const deleted = await callRpc<boolean>("delete_transaction", { p_id: txId })

    expect(deleted).toBe(true)
    // 잔액은 파생값이므로 자동 복원
    expect(await balanceOf(from)).toBe(100_000)
    expect(await balanceOf(to)).toBe(0)
    // transaction_tags는 FK CASCADE로 제거, 태그 마스터는 유지
    const links = await sql`SELECT 1 FROM public.transaction_tags`
    expect(links).toHaveLength(0)
    const tags = await sql`SELECT 1 FROM public.tags`
    expect(tags).toHaveLength(1)
  })

  test("returns false for a non-existent transaction", async () => {
    const deleted = await callRpc<boolean>("delete_transaction", {
      p_id: "00000000-0000-0000-0000-000000000000",
    })
    expect(deleted).toBe(false)
  })
})
