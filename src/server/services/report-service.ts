import "server-only"

import type {
  ReportCategoriesQuery,
  ReportNetWorthQuery,
  ReportTrendQuery,
} from "@/lib/validators"
import { getDb } from "@/server/db/client"
import {
  defaultTrendRange,
  fillTrendMonths,
  monthRange,
  type RawTrendRow,
} from "@/server/services/report-mapping"
import { toRatio } from "@/server/services/settlement-mapping"
import type {
  CategoryReportDto,
  NetWorthReportDto,
  TrendReportDto,
} from "@/types/api"

/**
 * 보고서 집계 (API.md §14) — 전부 읽기 전용 SELECT 각 1왕복.
 * 대분류 롤업·저축 구분은 category_rollup_v 공용 뷰로 결산과 동일 규칙 공유
 * (Phase 2 통합 — 마이그레이션 20260716000010).
 */

/** GET /reports/trend — 월별 수입/지출/저축 추이, 빈 달 0 채움 (API.md §14.1) */
export async function getTrendReport(
  query: ReportTrendQuery,
): Promise<TrendReportDto> {
  const fallback = defaultTrendRange(new Date())
  const from = query.from ?? fallback.from
  const to = query.to ?? fallback.to
  const { start, endExclusive } = monthRange(from, to)

  const sql = getDb()
  const rows = await sql`
    SELECT to_char(r.date, 'YYYY-MM') AS ym,
           COALESCE(SUM(r.amount) FILTER (WHERE r.type = 'income'), 0)::float8  AS income,
           COALESCE(SUM(r.amount) FILTER (WHERE r.type = 'expense'), 0)::float8 AS expense,
           COALESCE(SUM(r.amount) FILTER (
             WHERE r.type = 'expense' AND r.expense_kind = 'saving'), 0)::float8 AS saving
    FROM category_rollup_v r
    WHERE r.date >= ${start} AND r.date < ${endExclusive}
      AND r.type IN ('income', 'expense')
      AND r.status = 'applied'
    GROUP BY 1
  `

  return {
    months: fillTrendMonths(from, to, rows as unknown as RawTrendRow[]),
  }
}

/** GET /reports/categories — 선택 월 카테고리별 지출(대분류 롤업) 도넛 (API.md §14.2) */
export async function getCategoryReport(
  query: ReportCategoriesQuery,
): Promise<CategoryReportDto> {
  const sql = getDb()
  const rows = await sql`
    SELECT r.category_id,
           r.category_name          AS name,
           r.color,
           SUM(r.amount)::float8    AS amount
    FROM category_rollup_v r
    WHERE r.date >= make_date(${query.year}, ${query.month}, 1)
      AND r.date < make_date(${query.year}, ${query.month}, 1) + interval '1 month'
      AND r.type = 'expense'
      AND r.status = 'applied'
    GROUP BY 1, 2, 3
    ORDER BY amount DESC, name
  `

  const total = rows.reduce((sum, row) => sum + Number(row.amount), 0)
  return {
    total,
    byCategory: rows.map((row) => ({
      categoryId: row.category_id as string | null,
      name: row.name as string,
      color: row.color as string | null,
      amount: Number(row.amount),
      ratio: toRatio(Number(row.amount), total),
    })),
  }
}

/**
 * GET /reports/net-worth — 월말 순자산 시계열 (API.md §14.3).
 * 자산 트랙(asset_valuations 스냅샷) 랜딩 전까지 활성 계좌 잔액 기준으로 산출
 * — assetTotal은 0 placeholder, Phase 2 통합에서 스냅샷 결합으로 확장한다.
 * 월별 델타 + 윈도 누적합으로 거래 테이블 1회 스캔(1왕복).
 */
export async function getNetWorthReport(
  query: ReportNetWorthQuery,
): Promise<NetWorthReportDto> {
  const sql = getDb()
  const rows = await sql`
    WITH params AS (
      SELECT (date_trunc('month', CURRENT_DATE)
              - make_interval(months => ${query.months} - 1))::date AS first_month
    ),
    effects AS (
      SELECT e.aid, e.effect, e.date
      FROM (
        SELECT t.account_id AS aid,
               CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END AS effect,
               t.date
        FROM transactions t
        WHERE t.status = 'applied'
        UNION ALL
        SELECT t.to_account_id, t.amount, t.date
        FROM transactions t
        WHERE t.status = 'applied'
          AND t.to_account_id IS NOT NULL AND t.type IN ('transfer', 'expense')
      ) e
      JOIN accounts a ON a.id = e.aid AND a.is_active
    ),
    base AS (
      SELECT (SELECT COALESCE(SUM(initial_balance), 0) FROM accounts WHERE is_active)
             + COALESCE((SELECT SUM(ef.effect) FROM effects ef, params p
                          WHERE ef.date < p.first_month), 0) AS total
    ),
    months AS (
      SELECT (p.first_month + make_interval(months => gs.i))::date AS month_start
      FROM params p, generate_series(0, ${query.months} - 1) AS gs(i)
    ),
    deltas AS (
      SELECT date_trunc('month', ef.date)::date AS m, SUM(ef.effect) AS delta
      FROM effects ef, params p
      WHERE ef.date >= p.first_month
      GROUP BY 1
    )
    SELECT to_char((m.month_start + interval '1 month' - interval '1 day')::date,
                   'YYYY-MM-DD') AS date,
           (b.total + SUM(COALESCE(d.delta, 0))
              OVER (ORDER BY m.month_start))::float8 AS account_total
    FROM months m
    LEFT JOIN deltas d ON d.m = m.month_start
    CROSS JOIN base b
    ORDER BY m.month_start
  `

  return {
    points: rows.map((row) => ({
      date: row.date as string,
      accountTotal: Number(row.account_total),
      assetTotal: 0, // 자산 트랙 랜딩 후 asset_valuations 스냅샷 결합으로 확장
      netWorth: Number(row.account_total),
    })),
  }
}
