import { afterAll, beforeEach, describe, expect, test } from "vitest"

import { calculateNextDate } from "@/lib/calculations/recurring-date"
import { closeDb } from "@/server/db/client"
import { callRpc } from "@/server/rpc"

import { createTestDb, truncateTransactionCore } from "./helpers/db"

/**
 * Phase 2D 정기거래 도메인 규칙 통합 테스트 (docs/DB.md §3.6, §3.7 / PRD §5 규칙 4·10).
 * 로컬 Supabase(127.0.0.1:54322) 대상.
 * create_recurring은 내부적으로 "KST 오늘"을 쓰므로, 기대값은 DB에서 읽은
 * 오늘/지평(horizon)과 TS calculateNextDate 체인으로 계산해 실행 날짜에 독립적으로 만든다.
 */
const sql = createTestDb()

afterAll(async () => {
  await sql.end()
  await closeDb()
})

let bankId: string
let savingsId: string
let categoryId: string

beforeEach(async () => {
  await truncateTransactionCore(sql)
  const accounts = await sql`
    INSERT INTO public.accounts (name, type, initial_balance, sort_order) VALUES
      ('정기은행', 'bank', 100000, 0),
      ('정기적금', 'savings', 0, 1)
    RETURNING id
  `
  bankId = accounts[0].id
  savingsId = accounts[1].id
  const categories = await sql`
    INSERT INTO public.categories (name, type, expense_kind)
    VALUES ('구독', 'expense', 'consumption')
    RETURNING id
  `
  categoryId = categories[0].id
})

// ─── 날짜 헬퍼 (DB 기준 KST 오늘/지평 — 실행 시점 독립) ─────────────

async function kstToday(): Promise<string> {
  const rows = await sql`
    SELECT to_char((now() AT TIME ZONE 'Asia/Seoul')::date, 'YYYY-MM-DD') AS today
  `
  return rows[0].today as string
}

async function horizonOf(today: string): Promise<string> {
  const rows = await sql`
    SELECT to_char((${today}::date + interval '12 months')::date, 'YYYY-MM-DD') AS horizon
  `
  return rows[0].horizon as string
}

/** TS 체인으로 기대 pending 날짜 목록 전개 (start ≥ today 가정) */
function expandDates(
  start: string,
  frequency: "daily" | "weekly" | "monthly" | "yearly",
  interval: number,
  horizon: string,
): string[] {
  const dates: string[] = []
  let current = start
  while (current <= horizon) {
    dates.push(current)
    current = calculateNextDate(current, frequency, interval)
  }
  return dates
}

async function firstOfNextMonth(today: string): Promise<string> {
  const rows = await sql`
    SELECT to_char(
      (date_trunc('month', ${today}::date) + interval '1 month')::date,
      'YYYY-MM-DD') AS d
  `
  return rows[0].d as string
}

async function lastOfNextMonth(today: string): Promise<string> {
  const rows = await sql`
    SELECT to_char(
      (date_trunc('month', ${today}::date) + interval '2 months - 1 day')::date,
      'YYYY-MM-DD') AS d
  `
  return rows[0].d as string
}

async function createRule(
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const start = overrides.start_date ?? (await firstOfNextMonth(await kstToday()))
  return callRpc<string>("create_recurring", {
    p: {
      type: "expense",
      amount: 10000,
      description: "월 구독",
      category_id: categoryId,
      account_id: bankId,
      frequency: "monthly",
      interval: 1,
      ...overrides,
      start_date: start,
    },
  })
}

async function pendingDates(recurringId: string): Promise<string[]> {
  const rows = await sql`
    SELECT to_char(date, 'YYYY-MM-DD') AS date
    FROM public.transactions
    WHERE recurring_id = ${recurringId} AND status = 'pending'
    ORDER BY date
  `
  return rows.map((row) => row.date as string)
}

async function balanceOf(accountId: string): Promise<number> {
  const rows = await sql`
    SELECT current_balance FROM public.account_balances_v
    WHERE account_id = ${accountId}
  `
  return Number(rows[0].current_balance)
}

// ─── 생성 ────────────────────────────────────────────────────────

describe("create_recurring — 12개월 pending 생성 (PRD §5 규칙 10)", () => {
  test("다음 달 1일 시작 월간 규칙은 지평(오늘+12개월) 내 12건의 pending을 만든다", async () => {
    // Arrange
    const today = await kstToday()
    const start = await firstOfNextMonth(today)
    const horizon = await horizonOf(today)
    const expected = expandDates(start, "monthly", 1, horizon)

    // Act
    const id = await createRule({ start_date: start })

    // Assert
    expect(expected).toHaveLength(12)
    expect(await pendingDates(id)).toEqual(expected)

    const rule = await sql`
      SELECT to_char(next_date, 'YYYY-MM-DD') AS next_date, is_active
      FROM public.recurring_transactions WHERE id = ${id}
    `
    expect(rule[0].next_date).toBe(start)
    expect(rule[0].is_active).toBe(true)
  })

  test("월말 시작 규칙의 pending 체인은 TS calculateNextDate 체인과 일치한다 (월말 보정)", async () => {
    // Arrange — 다음 달 말일 시작 (28~31일 중 하나, 월말 보정 경로 통과)
    const today = await kstToday()
    const start = await lastOfNextMonth(today)
    const horizon = await horizonOf(today)
    const expected = expandDates(start, "monthly", 1, horizon)

    // Act
    const id = await createRule({ start_date: start })

    // Assert
    expect(await pendingDates(id)).toEqual(expected)
  })

  test("end_date가 있으면 그 이후 pending은 생성하지 않는다", async () => {
    // Arrange — 시작 + 2개월까지만 허용 → 3건
    const today = await kstToday()
    const start = await firstOfNextMonth(today)
    const endRows = await sql`
      SELECT to_char((${start}::date + interval '2 months')::date, 'YYYY-MM-DD') AS d
    `
    const end = endRows[0].d as string

    // Act
    const id = await createRule({ start_date: start, end_date: end })

    // Assert
    expect(await pendingDates(id)).toHaveLength(3)
  })

  test("pending 거래는 잔액에 반영되지 않는다 (applied만 집계)", async () => {
    // Act
    await createRule()

    // Assert
    expect(await balanceOf(bankId)).toBe(100000)
  })

  test("이체 규칙에 입금 계좌가 없으면 23514로 거부한다", async () => {
    await expect(
      createRule({ type: "transfer", category_id: null, to_account_id: null }),
    ).rejects.toMatchObject({ code: "23514" })
  })

  test("출금·입금 계좌가 같으면 23514로 거부한다", async () => {
    await expect(
      callRpc("create_recurring", {
        p: {
          type: "transfer",
          amount: 10000,
          description: "자기이체",
          account_id: bankId,
          to_account_id: bankId,
          frequency: "monthly",
          interval: 1,
          start_date: await firstOfNextMonth(await kstToday()),
        },
      }),
    ).rejects.toMatchObject({ code: "23514" })
  })
})

// ─── 도래 처리 ───────────────────────────────────────────────────

describe("process_due_transactions — 도래 pending → applied (DB.md §3.7)", () => {
  test("오늘 시작 규칙: 도래분 applied 전환 + 잔액 반영 + 지평 재충전", async () => {
    // Arrange — 오늘 시작 → 오늘자 pending 포함
    const today = await kstToday()
    const horizon = await horizonOf(today)
    const id = await createRule({ start_date: today })
    const before = await pendingDates(id)
    expect(before[0]).toBe(today)

    // Act
    const result = await callRpc<{
      applied: number
      generated: number
      deactivated: number
    }>("process_due_transactions", { p_today: today })

    // Assert — 오늘자 1건 applied
    expect(result.applied).toBe(1)
    const appliedRows = await sql`
      SELECT to_char(date, 'YYYY-MM-DD') AS date
      FROM public.transactions
      WHERE recurring_id = ${id} AND status = 'applied'
    `
    expect(appliedRows).toHaveLength(1)
    expect(appliedRows[0].date).toBe(today)

    // 잔액 반영: 100,000 − 10,000
    expect(await balanceOf(bankId)).toBe(90000)

    // next_date 전진 (오늘 초과)
    const rule = await sql`
      SELECT to_char(next_date, 'YYYY-MM-DD') AS next_date
      FROM public.recurring_transactions WHERE id = ${id}
    `
    expect(rule[0].next_date).toBe(calculateNextDate(today, "monthly", 1))

    // 재충전: 남은 pending 체인 = next_date부터 지평까지
    const expectedPending = expandDates(
      calculateNextDate(today, "monthly", 1),
      "monthly",
      1,
      horizon,
    )
    expect(await pendingDates(id)).toEqual(expectedPending)
  })

  test("같은 날짜로 재실행하면 멱등하다 (applied 0, 신규 생성 0)", async () => {
    // Arrange
    const today = await kstToday()
    const id = await createRule({ start_date: today })
    await callRpc("process_due_transactions", { p_today: today })
    const pendingAfterFirst = await pendingDates(id)

    // Act
    const second = await callRpc<{ applied: number; generated: number }>(
      "process_due_transactions",
      { p_today: today },
    )

    // Assert
    expect(second.applied).toBe(0)
    expect(second.generated).toBe(0)
    expect(await pendingDates(id)).toEqual(pendingAfterFirst)
    expect(await balanceOf(bankId)).toBe(90000)
  })

  test("end_date를 지난 규칙은 비활성화된다", async () => {
    // Arrange — 오늘 시작, 오늘 종료(1회성)
    const today = await kstToday()
    const id = await createRule({ start_date: today, end_date: today })
    expect(await pendingDates(id)).toEqual([today])

    // Act
    const result = await callRpc<{ deactivated: number }>(
      "process_due_transactions",
      { p_today: today },
    )

    // Assert
    expect(result.deactivated).toBe(1)
    const rule = await sql`
      SELECT is_active FROM public.recurring_transactions WHERE id = ${id}
    `
    expect(rule[0].is_active).toBe(false)
    expect(await pendingDates(id)).toEqual([])
  })

  test("이체 규칙 도래 시 출금·입금 잔액이 함께 이동한다", async () => {
    // Arrange
    const today = await kstToday()
    const id = await callRpc<string>("create_recurring", {
      p: {
        type: "transfer",
        amount: 30000,
        description: "적금 자동이체",
        account_id: bankId,
        to_account_id: savingsId,
        frequency: "monthly",
        interval: 1,
        start_date: today,
      },
    })
    expect(id).toBeTruthy()

    // Act
    await callRpc("process_due_transactions", { p_today: today })

    // Assert
    expect(await balanceOf(bankId)).toBe(70000)
    expect(await balanceOf(savingsId)).toBe(30000)
  })
})

// ─── 수정/비활성/삭제 ────────────────────────────────────────────

describe("update_recurring / delete_recurring (API.md §12.4, §12.5)", () => {
  test("금액 수정 시 미래 pending이 새 금액으로 재생성된다", async () => {
    // Arrange
    const id = await createRule()

    // Act
    await callRpc("update_recurring", { p_id: id, p: { amount: 25000 } })

    // Assert
    const amounts = await sql`
      SELECT DISTINCT amount FROM public.transactions
      WHERE recurring_id = ${id} AND status = 'pending'
    `
    expect(amounts).toHaveLength(1)
    expect(Number(amounts[0].amount)).toBe(25000)
  })

  test("비활성화(is_active=false)하면 미래 pending이 정리되고 applied 이력은 보존된다", async () => {
    // Arrange — 오늘 시작 → 1건 applied 후 비활성화
    const today = await kstToday()
    const id = await createRule({ start_date: today })
    await callRpc("process_due_transactions", { p_today: today })
    expect((await pendingDates(id)).length).toBeGreaterThan(0)

    // Act
    await callRpc("update_recurring", { p_id: id, p: { is_active: false } })

    // Assert
    expect(await pendingDates(id)).toEqual([])
    const applied = await sql`
      SELECT count(*)::int AS count FROM public.transactions
      WHERE recurring_id = ${id} AND status = 'applied'
    `
    expect(applied[0].count).toBe(1)
    expect(await balanceOf(bankId)).toBe(90000)
  })

  test("재활성화(is_active=true)하면 pending이 다시 생성된다", async () => {
    // Arrange
    const id = await createRule()
    await callRpc("update_recurring", { p_id: id, p: { is_active: false } })
    expect(await pendingDates(id)).toEqual([])

    // Act
    await callRpc("update_recurring", { p_id: id, p: { is_active: true } })

    // Assert
    expect((await pendingDates(id)).length).toBe(12)
  })

  test("없는 규칙 수정은 CF404로 실패한다", async () => {
    await expect(
      callRpc("update_recurring", {
        p_id: "00000000-0000-4000-8000-000000000000",
        p: { amount: 1 },
      }),
    ).rejects.toMatchObject({ code: "CF404" })
  })

  test("삭제 시 pending은 제거되고 applied 이력은 recurring_id=NULL로 보존된다", async () => {
    // Arrange
    const today = await kstToday()
    const id = await createRule({ start_date: today })
    await callRpc("process_due_transactions", { p_today: today })

    // Act
    const deleted = await callRpc<boolean>("delete_recurring", { p_id: id })

    // Assert
    expect(deleted).toBe(true)
    const rules = await sql`
      SELECT count(*)::int AS count FROM public.recurring_transactions
    `
    expect(rules[0].count).toBe(0)
    const orphans = await sql`
      SELECT count(*)::int AS count FROM public.transactions
      WHERE status = 'applied' AND recurring_id IS NULL
    `
    expect(orphans[0].count).toBe(1)
    expect(await balanceOf(bankId)).toBe(90000)
  })

  test("없는 규칙 삭제는 false를 반환한다", async () => {
    const deleted = await callRpc<boolean>("delete_recurring", {
      p_id: "00000000-0000-4000-8000-000000000000",
    })
    expect(deleted).toBe(false)
  })
})
