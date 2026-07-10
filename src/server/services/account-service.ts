import "server-only"

import type postgres from "postgres"

import type {
  CreateAccountInput,
  ReorderInput,
  UpdateAccountInput,
} from "@/lib/validators"
import { ApiError } from "@/server/api-errors"
import { getDb } from "@/server/db/client"
import type { AccountDto } from "@/types/api"

type Row = postgres.Row

/** 계좌 SELECT 컬럼 (별칭 인자) — numeric/date는 캐스팅해 안전한 JS 타입으로 */
function accountColumns(alias: string): string {
  const a = alias
  return `
    ${a}.id, ${a}.name, ${a}.type, ${a}.initial_balance, ${a}.color, ${a}.icon,
    ${a}.is_active, ${a}.sort_order, ${a}.asset_id, ${a}.deposit_type, ${a}.term_months,
    ${a}.interest_rate::float8 AS interest_rate, ${a}.tax_type,
    ${a}.open_date::text AS open_date, ${a}.monthly_payment, ${a}.billing_day,
    ${a}.credit_limit, ${a}.linked_account_id, ${a}.created_at, ${a}.updated_at
  `
}

function toNullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value)
}

function mapAccountRow(row: Row): AccountDto {
  return {
    id: row.id as string,
    name: row.name as string,
    type: row.type as AccountDto["type"],
    balance: Number(row.current_balance),
    initialBalance: Number(row.initial_balance),
    color: (row.color as string | null) ?? null,
    icon: (row.icon as string | null) ?? null,
    sortOrder: Number(row.sort_order),
    isActive: Boolean(row.is_active),
    depositType: (row.deposit_type as AccountDto["depositType"]) ?? null,
    termMonths: toNullableNumber(row.term_months),
    interestRate: toNullableNumber(row.interest_rate),
    taxType: (row.tax_type as AccountDto["taxType"]) ?? null,
    openDate: (row.open_date as string | null) ?? null,
    monthlyPayment: toNullableNumber(row.monthly_payment),
    billingDay: toNullableNumber(row.billing_day),
    creditLimit: toNullableNumber(row.credit_limit),
    linkedAccountId: (row.linked_account_id as string | null) ?? null,
    assetId: (row.asset_id as string | null) ?? null,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  }
}

/** GET /accounts — accounts ⋈ account_balances_v 1왕복 (API.md §3.1) */
export async function listAccounts(): Promise<AccountDto[]> {
  const sql = getDb()
  const rows = await sql`
    SELECT ${sql.unsafe(accountColumns("a"))}, b.current_balance
    FROM accounts a
    JOIN account_balances_v b ON b.account_id = a.id
    ORDER BY a.sort_order, a.created_at
  `
  return rows.map(mapAccountRow)
}

/** POST /accounts — 단문 INSERT … RETURNING 1왕복. balance 입력은 initialBalance로 저장 (API.md §3.2) */
export async function createAccount(input: CreateAccountInput): Promise<AccountDto> {
  const sql = getDb()
  const rows = await sql`
    INSERT INTO accounts (
      name, type, initial_balance, color, icon,
      deposit_type, term_months, interest_rate, tax_type, open_date, monthly_payment,
      billing_day, credit_limit, linked_account_id, asset_id,
      sort_order
    ) VALUES (
      ${input.name}, ${input.type}, ${input.balance},
      ${input.color ?? null}, ${input.icon ?? null},
      ${input.depositType ?? null}, ${input.termMonths ?? null},
      ${input.interestRate ?? null}, ${input.taxType ?? null},
      ${input.openDate ?? null}, ${input.monthlyPayment ?? null},
      ${input.billingDay ?? null}, ${input.creditLimit ?? null},
      ${input.linkedAccountId ?? null}, ${input.assetId ?? null},
      (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM accounts)
    )
    RETURNING ${sql.unsafe(accountColumns("accounts"))}, initial_balance AS current_balance
  `
  return mapAccountRow(rows[0])
}

/** GET /accounts/{id} (API.md §3.3) */
export async function getAccount(id: string): Promise<AccountDto> {
  const sql = getDb()
  const rows = await sql`
    SELECT ${sql.unsafe(accountColumns("a"))}, b.current_balance
    FROM accounts a
    JOIN account_balances_v b ON b.account_id = a.id
    WHERE a.id = ${id}
  `
  if (rows.length === 0) {
    throw new ApiError(404, "NOT_FOUND", `계좌를 찾을 수 없습니다: ${id}`)
  }
  return mapAccountRow(rows[0])
}

const UPDATE_COLUMN_MAP: Record<string, string> = {
  name: "name",
  type: "type",
  initialBalance: "initial_balance",
  color: "color",
  icon: "icon",
  depositType: "deposit_type",
  termMonths: "term_months",
  interestRate: "interest_rate",
  taxType: "tax_type",
  openDate: "open_date",
  monthlyPayment: "monthly_payment",
  billingDay: "billing_day",
  creditLimit: "credit_limit",
  linkedAccountId: "linked_account_id",
  assetId: "asset_id",
  sortOrder: "sort_order",
  isActive: "is_active",
}

/**
 * PATCH /accounts/{id} — 단일 문장 UPDATE + 잔액 재계산 (API.md §3.4).
 * 뷰는 문장 시작 스냅샷을 읽으므로 잔액은 net_effect(구 잔액 − 구 initial)로 재조립한다.
 */
export async function updateAccount(
  id: string,
  input: UpdateAccountInput,
): Promise<AccountDto> {
  const data: Record<string, unknown> = {}
  for (const [key, column] of Object.entries(UPDATE_COLUMN_MAP)) {
    const value = (input as Record<string, unknown>)[key]
    if (value !== undefined) data[column] = value
  }
  if (Object.keys(data).length === 0) {
    return getAccount(id)
  }

  const sql = getDb()
  const rows = await sql`
    WITH u AS (
      UPDATE accounts SET ${sql(data)} WHERE id = ${id} RETURNING *
    )
    SELECT ${sql.unsafe(accountColumns("u"))},
           (u.initial_balance + (b.current_balance - b.initial_balance))::bigint AS current_balance
    FROM u
    JOIN account_balances_v b ON b.account_id = u.id
  `
  if (rows.length === 0) {
    throw new ApiError(404, "NOT_FOUND", `계좌를 찾을 수 없습니다: ${id}`)
  }
  return mapAccountRow(rows[0])
}

/** DELETE /accounts/{id} — 참조 중이면 FK RESTRICT → 409 (API.md §3.5) */
export async function deleteAccount(id: string): Promise<{ id: string }> {
  const sql = getDb()
  const rows = await sql`DELETE FROM accounts WHERE id = ${id} RETURNING id`
  if (rows.length === 0) {
    throw new ApiError(404, "NOT_FOUND", `계좌를 찾을 수 없습니다: ${id}`)
  }
  return { id }
}

/** PATCH /accounts/order — unnest 배열 조인 단일 UPDATE 1왕복 (API.md §3.6) */
export async function reorderAccounts(input: ReorderInput): Promise<{ updated: number }> {
  const sql = getDb()
  const ids = input.items.map((item) => item.id)
  const orders = input.items.map((item) => item.sortOrder)
  const result = await sql`
    UPDATE accounts a SET sort_order = v.sort_order
    FROM (SELECT unnest(${ids}::uuid[]) AS id, unnest(${orders}::int[]) AS sort_order) v
    WHERE a.id = v.id
  `
  return { updated: result.count }
}
