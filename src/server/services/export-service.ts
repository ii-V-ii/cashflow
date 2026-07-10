import "server-only"

import type postgres from "postgres"

import type { ExportTransactionsQuery } from "@/lib/validators"
import { getDb } from "@/server/db/client"

type Row = postgres.Row

/**
 * GET /export/transactions — 거래 CSV 직렬화 (API.md §15.1).
 * envelope 미적용 유일 엔드포인트 — 조인 SELECT 1왕복 후 직렬화.
 */

const CSV_HEADER = [
  "날짜",
  "유형",
  "카테고리",
  "계좌",
  "도착계좌",
  "금액",
  "내용",
  "메모",
  "태그",
  "할부",
] as const

const TYPE_LABELS: Record<string, string> = {
  income: "수입",
  expense: "지출",
  transfer: "이체",
}

/** RFC 4180: 쉼표·따옴표·줄바꿈 포함 시 따옴표 감싸기 + 내부 따옴표 이중화 */
function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ""
  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function csvLine(row: Row): string {
  const installment =
    row.installment_months === null
      ? ""
      : `${Number(row.installment_current ?? 1)}/${Number(row.installment_months)}`

  return [
    csvField(row.date as string),
    csvField(TYPE_LABELS[row.type as string] ?? (row.type as string)),
    csvField(row.category_name as string | null),
    csvField(row.account_name as string),
    csvField(row.to_account_name as string | null),
    csvField(Number(row.amount)),
    csvField(row.description as string),
    csvField(row.memo as string | null),
    csvField(row.tag_names as string | null),
    csvField(installment),
  ].join(",")
}

export async function exportTransactionsCsv(
  query: ExportTransactionsQuery,
): Promise<string> {
  const sql = getDb()
  const rows = await sql`
    SELECT to_char(t.date, 'YYYY-MM-DD') AS date, t.type,
           c.name AS category_name, a.name AS account_name,
           ta.name AS to_account_name, t.amount::float8 AS amount,
           t.description, t.memo, tg.tag_names,
           t.installment_months, t.installment_current
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    LEFT JOIN categories c ON c.id = t.category_id
    LEFT JOIN accounts ta ON ta.id = t.to_account_id
    LEFT JOIN LATERAL (
      SELECT string_agg(tag.name, ',' ORDER BY tag.name) AS tag_names
      FROM transaction_tags tt
      JOIN tags tag ON tag.id = tt.tag_id
      WHERE tt.transaction_id = t.id
    ) tg ON true
    WHERE TRUE
      ${query.from ? sql`AND t.date >= ${query.from}` : sql``}
      ${query.to ? sql`AND t.date <= ${query.to}` : sql``}
    ORDER BY t.date, t.created_at
  `

  const lines = [CSV_HEADER.join(","), ...rows.map(csvLine)]
  return lines.join("\n") + "\n"
}

/** Content-Disposition 파일명 — 기간 미지정 시 all (API.md §15.1) */
export function exportFilename(query: ExportTransactionsQuery): string {
  if (!query.from && !query.to) return "transactions_all.csv"
  return `transactions_${query.from ?? "all"}_${query.to ?? "all"}.csv`
}
