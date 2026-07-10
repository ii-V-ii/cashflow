import "server-only"

import type postgres from "postgres"

import type {
  CreateTransactionInput,
  ListTransactionsQuery,
  UpdateTransactionInput,
} from "@/lib/validators"
import { ApiError } from "@/server/api-errors"
import { getDb } from "@/server/db/client"
import { callRpc } from "@/server/rpc"
import type { TransactionDto } from "@/types/api"

type Sql = postgres.Sql

/**
 * Transaction DTO(API.md §2.1)를 SQL에서 완성한다 — 조인 1왕복, 재조회 없음.
 * 별칭 규약: t=transactions, a=account, c=category, ta=toAccount, tg=태그 lateral.
 */
function txJson(sql: Sql) {
  return sql`jsonb_build_object(
    'id', t.id,
    'type', t.type,
    'amount', t.amount,
    'description', t.description,
    'date', to_char(t.date, 'YYYY-MM-DD'),
    'categoryId', t.category_id,
    'category', CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', c.id, 'name', c.name, 'icon', c.icon, 'color', c.color,
      'expenseKind', c.expense_kind) END,
    'accountId', t.account_id,
    'account', jsonb_build_object('id', a.id, 'name', a.name, 'type', a.type),
    'toAccountId', t.to_account_id,
    'toAccount', CASE WHEN ta.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', ta.id, 'name', ta.name, 'type', ta.type) END,
    'memo', t.memo,
    'tags', tg.tags,
    'installmentMonths', t.installment_months,
    'installmentCurrent', t.installment_current,
    'status', t.status,
    'recurringId', t.recurring_id,
    'createdAt', t.created_at,
    'updatedAt', t.updated_at
  )`
}

/** 태그는 lateral jsonb_agg 배치 로드 — 거래별 추가 쿼리(N+1) 금지 */
function txJoins(sql: Sql) {
  return sql`
    JOIN accounts a ON a.id = t.account_id
    LEFT JOIN categories c ON c.id = t.category_id
    LEFT JOIN accounts ta ON ta.id = t.to_account_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(
        jsonb_agg(jsonb_build_object('id', tag.id, 'name', tag.name, 'color', tag.color)
                  ORDER BY tag.name),
        '[]'::jsonb) AS tags
      FROM transaction_tags tt
      JOIN tags tag ON tag.id = tt.tag_id
      WHERE tt.transaction_id = t.id
    ) tg ON true
  `
}

function txFilters(sql: Sql, query: ListTransactionsQuery) {
  return sql`
    ${query.type ? sql`AND t.type = ${query.type}` : sql``}
    ${query.categoryId ? sql`AND t.category_id = ${query.categoryId}` : sql``}
    ${
      query.accountId
        ? sql`AND (t.account_id = ${query.accountId} OR t.to_account_id = ${query.accountId})`
        : sql``
    }
    ${query.from ? sql`AND t.date >= ${query.from}` : sql``}
    ${query.to ? sql`AND t.date <= ${query.to}` : sql``}
    ${
      query.search
        ? sql`AND (t.description ILIKE ${`%${query.search}%`} OR t.memo ILIKE ${`%${query.search}%`})`
        : sql``
    }
    ${
      query.tags !== undefined && query.tags.length > 0
        ? sql`AND EXISTS (
            SELECT 1 FROM transaction_tags xt
            JOIN tags xtag ON xtag.id = xt.tag_id
            WHERE xt.transaction_id = t.id AND xtag.name = ANY(${query.tags})
          )`
        : sql``
    }
  `
}

export interface TransactionPage {
  items: TransactionDto[]
  total: number
  page: number
  limit: number
}

/** GET /transactions — 조인 SELECT 1문 + count(*) over() 1왕복 (API.md §2.1) */
export async function listTransactions(
  query: ListTransactionsQuery,
): Promise<TransactionPage> {
  const sql = getDb()
  const offset = (query.page - 1) * query.limit

  const rows = await sql`
    SELECT ${txJson(sql)} AS tx, count(*) over() AS total
    FROM transactions t
    ${txJoins(sql)}
    WHERE TRUE ${txFilters(sql, query)}
    ORDER BY t.date DESC, t.created_at DESC
    LIMIT ${query.limit} OFFSET ${offset}
  `

  let total = rows.length > 0 ? Number(rows[0].total) : 0
  if (rows.length === 0 && query.page > 1) {
    // 범위를 벗어난 페이지 — total만 별도 산출
    const countRows = await sql`
      SELECT count(*)::float8 AS total FROM transactions t
      WHERE TRUE ${txFilters(sql, query)}
    `
    total = Number(countRows[0].total)
  }

  return {
    items: rows.map((row) => row.tx as TransactionDto),
    total,
    page: query.page,
    limit: query.limit,
  }
}

function toRpcPayload(
  input: CreateTransactionInput | UpdateTransactionInput,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  const assign = (key: string, value: unknown) => {
    if (value !== undefined) payload[key] = value
  }
  assign("type", input.type)
  assign("amount", input.amount)
  assign("description", input.description)
  assign("category_id", input.categoryId)
  assign("account_id", input.accountId)
  assign("to_account_id", input.toAccountId)
  assign("date", input.date)
  assign("memo", input.memo)
  assign("tags", input.tags)
  assign("installment_months", input.installmentMonths)
  assign("installment_current", input.installmentCurrent)
  return payload
}

/**
 * POST /transactions — RPC + DTO(jsonb)를 단일 문장으로 (총 1왕복, API.md §2.2).
 * transaction_json은 VOLATILE — 같은 문장 안에서 RPC가 upsert한 태그까지 본다.
 */
export async function createTransaction(
  input: CreateTransactionInput,
): Promise<TransactionDto> {
  if (input.type === "expense" && input.toAccountId && !input.categoryId) {
    throw new ApiError(
      422,
      "SAVING_CATEGORY_REQUIRED",
      "저축 거래는 카테고리가 필요합니다",
    )
  }

  const sql = getDb()
  const rows = await sql`
    SELECT public.transaction_json(
      (public.create_transaction(${sql.json(toRpcPayload(input) as never)})).id
    ) AS tx
  `
  return rows[0].tx as TransactionDto
}

/** GET /transactions/{id} — transaction_json 1왕복 (API.md §2.3) */
export async function getTransaction(id: string): Promise<TransactionDto> {
  const sql = getDb()
  const rows = await sql`SELECT public.transaction_json(${id}::uuid) AS tx`
  const tx = rows[0]?.tx as TransactionDto | null
  if (!tx) {
    throw new ApiError(404, "NOT_FOUND", `거래를 찾을 수 없습니다: ${id}`)
  }
  return tx
}

/** PATCH /transactions/{id} — update_transaction RPC + DTO 1왕복 (API.md §2.4) */
export async function updateTransaction(
  id: string,
  input: UpdateTransactionInput,
): Promise<TransactionDto> {
  const sql = getDb()
  const rows = await sql`
    SELECT public.transaction_json(
      (public.update_transaction(${id}::uuid, ${sql.json(toRpcPayload(input) as never)})).id
    ) AS tx
  `
  return rows[0].tx as TransactionDto
}

/** DELETE /transactions/{id} — delete_transaction RPC 1왕복 (API.md §2.5) */
export async function deleteTransaction(id: string): Promise<{ id: string }> {
  const deleted = await callRpc<boolean>("delete_transaction", { p_id: id })
  if (!deleted) {
    throw new ApiError(404, "NOT_FOUND", `거래를 찾을 수 없습니다: ${id}`)
  }
  return { id }
}
