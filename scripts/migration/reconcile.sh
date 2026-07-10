#!/usr/bin/env bash
# reconcile.sh — 4대 대사(row count / 잔액 / FIFO / 결산) 실행 + 마크다운 리포트 출력
#
# 사용법:
#   DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
#     bash scripts/migration/reconcile.sh > /tmp/recon.md
#
# 전제: legacy 스키마 적재 완료(MIGRATION.md §1.3). transform.sql 실행 전이면 전부 FAIL(RED).
# 종료 코드: 대사 결과에 FAIL 이 하나라도 있으면 1, all-pass 면 0.
set -euo pipefail

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FAIL_COUNT=0

psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f "$SCRIPT_DIR/00_to_uuid.sql" >&2

md_table() {
  python3 -c '
import csv, sys
rows = list(csv.reader(sys.stdin))
if not rows:
    print("_0 rows_"); sys.exit()
hdr, data = rows[0], rows[1:]
print("| " + " | ".join(hdr) + " |")
print("|" + "---|" * len(hdr))
for r in data:
    print("| " + " | ".join(x.replace("|", "\\|") for x in r) + " |")
if not data:
    print()
    print("_0 rows_")
'
}

run_check() { # $1 = 제목, SQL은 stdin
  local title="$1" out
  out="$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 --csv)" || { echo "**ERROR: $title 실행 실패**"; FAIL_COUNT=$((FAIL_COUNT+1)); return; }
  echo "$title"
  echo
  echo "$out" | md_table
  echo
  local fails
  fails=$(echo "$out" | grep -c 'FAIL' || true)
  FAIL_COUNT=$((FAIL_COUNT + fails))
}

echo "# 마이그레이션 대사 리포트"
echo
echo "- 실행 시각: $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "- 대상 DB: ${DB_URL%%\?*}" | sed -E 's#//[^@]+@#//***@#'
echo

# ──────────────────────────────────────────────────────────────
echo "## 0. 진단 (legacy 원본)"
echo

run_check "### 0.1 legacy PK 포맷 분포 (UUID 직접 캐스팅 분기 실효성)" <<'SQL'
WITH ids AS (
  SELECT 'accounts' tbl, id FROM legacy.accounts UNION ALL
  SELECT 'asset_categories', id FROM legacy.asset_categories UNION ALL
  SELECT 'assets', id FROM legacy.assets UNION ALL
  SELECT 'asset_valuations', id FROM legacy.asset_valuations UNION ALL
  SELECT 'budget_items', id FROM legacy.budget_items UNION ALL
  SELECT 'budgets', id FROM legacy.budgets UNION ALL
  SELECT 'categories', id FROM legacy.categories UNION ALL
  SELECT 'forecast_results', id FROM legacy.forecast_results UNION ALL
  SELECT 'forecast_scenarios', id FROM legacy.forecast_scenarios UNION ALL
  SELECT 'investment_trades', id FROM legacy.investment_trades UNION ALL
  SELECT 'recurring_transactions', id FROM legacy.recurring_transactions UNION ALL
  SELECT 'tags', id FROM legacy.tags UNION ALL
  SELECT 'transactions', id FROM legacy.transactions
)
SELECT tbl,
  count(*) FILTER (WHERE id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') AS uuid_format,
  count(*) FILTER (WHERE id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') AS non_uuid_format
FROM ids GROUP BY tbl ORDER BY tbl;
SQL

run_check "### 0.2 to_uuid 충돌 검사 (변환 후 uuid 유일성)" <<'SQL'
WITH ids AS (
  SELECT 'accounts' tbl, id FROM legacy.accounts UNION ALL
  SELECT 'asset_categories', id FROM legacy.asset_categories UNION ALL
  SELECT 'assets', id FROM legacy.assets UNION ALL
  SELECT 'asset_valuations', id FROM legacy.asset_valuations UNION ALL
  SELECT 'budget_items', id FROM legacy.budget_items UNION ALL
  SELECT 'budgets', id FROM legacy.budgets UNION ALL
  SELECT 'categories', id FROM legacy.categories UNION ALL
  SELECT 'forecast_results', id FROM legacy.forecast_results UNION ALL
  SELECT 'forecast_scenarios', id FROM legacy.forecast_scenarios UNION ALL
  SELECT 'investment_trades', id FROM legacy.investment_trades UNION ALL
  SELECT 'recurring_transactions', id FROM legacy.recurring_transactions UNION ALL
  SELECT 'tags', id FROM legacy.tags UNION ALL
  SELECT 'transactions', id FROM legacy.transactions
)
SELECT count(*) AS total_ids,
       count(DISTINCT legacy.to_uuid(id)) AS distinct_uuids,
       CASE WHEN count(*) = count(DISTINCT legacy.to_uuid(id)) THEN 'PASS' ELSE 'FAIL' END AS result
FROM (SELECT tbl || ':' || id AS id FROM ids) s;
SQL

run_check "### 0.3 자기이체 오염 행 (§4.7 제외 대상)" <<'SQL'
SELECT count(*) AS self_transfer_rows,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'WARN(제외 후 5.1에서 자동 검증)' END AS result
FROM legacy.transactions
WHERE to_account_id IS NOT NULL AND to_account_id = account_id;
SQL

run_check "### 0.4 investment_returns 보존 확인 (이관 제외 — legacy 보존)" <<'SQL'
SELECT (SELECT count(*) FROM legacy.investment_returns) AS preserved_rows,
       (SELECT count(*) FROM legacy.investment_returns
        WHERE unrealized_gain <> 0 OR COALESCE(return_rate, 0) <> 0) AS manual_input_rows;
SQL

# ──────────────────────────────────────────────────────────────
echo "## 1. Row count 대사 (§5.1)"
echo

run_check "### 1.1 테이블별 row count" <<'SQL'
WITH pairs(tbl, legacy_cnt, new_cnt) AS (VALUES
  ('asset_categories',       (SELECT count(*) FROM legacy.asset_categories),       (SELECT count(*) FROM public.asset_categories)),
  ('assets',                 (SELECT count(*) FROM legacy.assets),                 (SELECT count(*) FROM public.assets)),
  ('categories',             (SELECT count(*) FROM legacy.categories),             (SELECT count(*) FROM public.categories)),
  ('accounts',               (SELECT count(*) FROM legacy.accounts),               (SELECT count(*) FROM public.accounts)),
  ('tags',                   (SELECT count(*) FROM legacy.tags),                   (SELECT count(*) FROM public.tags)),
  ('recurring_transactions', (SELECT count(*) FROM legacy.recurring_transactions), (SELECT count(*) FROM public.recurring_transactions)),
  ('transactions',           (SELECT count(*) FROM legacy.transactions),           (SELECT count(*) FROM public.transactions)),
  ('transaction_tags',       (SELECT count(*) FROM legacy.transaction_tags),       (SELECT count(*) FROM public.transaction_tags)),
  ('budgets',                (SELECT count(*) FROM legacy.budgets),                (SELECT count(*) FROM public.budgets)),
  ('budget_items',           (SELECT count(*) FROM legacy.budget_items),           (SELECT count(*) FROM public.budget_items)),
  ('asset_valuations',       (SELECT count(*) FROM legacy.asset_valuations),       (SELECT count(*) FROM public.asset_valuations)),
  ('investment_trades',      (SELECT count(*) FROM legacy.investment_trades),      (SELECT count(*) FROM public.investment_trades)),
  ('forecast_scenarios',     (SELECT count(*) FROM legacy.forecast_scenarios),     (SELECT count(*) FROM public.forecast_scenarios)),
  ('forecast_results',       (SELECT count(*) FROM legacy.forecast_results),       (SELECT count(*) FROM public.forecast_results))
), excluded AS (
  SELECT count(*) AS cnt FROM legacy.transactions
  WHERE to_account_id IS NOT NULL AND to_account_id = account_id
)
SELECT tbl, legacy_cnt, new_cnt, new_cnt - legacy_cnt AS diff,
       CASE WHEN legacy_cnt = new_cnt THEN 'PASS'
            WHEN tbl = 'transactions'
             AND legacy_cnt - new_cnt = (SELECT cnt FROM excluded) THEN 'PASS(자기이체 제외분)'
            ELSE 'FAIL' END AS result
FROM pairs
ORDER BY (legacy_cnt = new_cnt), tbl;
SQL

run_check "### 1.2 transactions diff == 자기이체 제외 건수 자동 검증" <<'SQL'
WITH excluded AS (
  SELECT count(*) AS cnt FROM legacy.transactions
  WHERE to_account_id IS NOT NULL AND to_account_id = account_id
),
counts AS (
  SELECT (SELECT count(*) FROM legacy.transactions) AS legacy_cnt,
         (SELECT count(*) FROM public.transactions) AS new_cnt
)
SELECT c.legacy_cnt, c.new_cnt, e.cnt AS excluded_self_transfer,
       c.legacy_cnt - c.new_cnt AS diff,
       CASE WHEN c.legacy_cnt - c.new_cnt = e.cnt THEN 'PASS' ELSE 'FAIL' END AS result
FROM counts c, excluded e;
SQL

# ──────────────────────────────────────────────────────────────
echo "## 2. 잔액 대사 (§5.2 — legacy 저장값 vs 파생 뷰)"
echo

run_check "### 2.1 계좌별 잔액 (legacy.current_balance vs account_balances_v)" <<'SQL'
SELECT la.name, la.type,
       la.current_balance AS legacy_stored,
       ab.current_balance AS derived,
       ab.current_balance - la.current_balance AS diff,
       CASE WHEN ab.current_balance = la.current_balance THEN 'PASS' ELSE 'FAIL' END AS result
FROM legacy.accounts la
LEFT JOIN public.account_balances_v ab ON ab.account_id = legacy.to_uuid(la.id)
ORDER BY abs(COALESCE(ab.current_balance, 0) - la.current_balance) DESC, la.name;
SQL

run_check "### 2.2 잔액 대사 요약" <<'SQL'
SELECT count(*) AS legacy_accounts,
       count(ab.account_id) AS matched_in_view,
       count(*) FILTER (WHERE ab.current_balance IS DISTINCT FROM la.current_balance) AS mismatch,
       COALESCE(SUM(ab.current_balance - la.current_balance)
                FILTER (WHERE ab.current_balance <> la.current_balance), 0) AS mismatch_amount_sum,
       CASE WHEN count(*) = count(ab.account_id)
             AND count(*) FILTER (WHERE ab.current_balance IS DISTINCT FROM la.current_balance) = 0
            THEN 'PASS' ELSE 'FAIL' END AS result
FROM legacy.accounts la
LEFT JOIN public.account_balances_v ab ON ab.account_id = legacy.to_uuid(la.id);
SQL

run_check "### 2.3 자산가치 보조 대사 (legacy.current_value vs asset_values_v)" <<'SQL'
SELECT la.name,
       la.current_value AS legacy_stored,
       av.current_value AS derived,
       av.current_value - la.current_value AS diff,
       CASE WHEN av.current_value = la.current_value THEN 'PASS' ELSE 'FAIL' END AS result
FROM legacy.assets la
LEFT JOIN public.asset_values_v av ON av.asset_id = legacy.to_uuid(la.id)
ORDER BY abs(COALESCE(av.current_value, 0) - la.current_value) DESC, la.name;
SQL

# ──────────────────────────────────────────────────────────────
echo "## 3. FIFO 수량 대사 (§5.3)"
echo

run_check "### 3.1 건별 로트 상태 이관 충실도 (buy.remaining / sell.realized_gain)" <<'SQL'
SELECT count(*) AS legacy_trades,
       count(n.id) AS migrated,
       count(*) FILTER (WHERE l.trade_type = 'buy'
                          AND n.remaining_quantity IS DISTINCT FROM l.remaining_quantity::numeric(20,8)) AS buy_rq_mismatch,
       count(*) FILTER (WHERE l.trade_type = 'sell'
                          AND n.realized_gain IS DISTINCT FROM l.realized_gain::bigint) AS sell_rg_mismatch,
       CASE WHEN count(*) = count(n.id)
             AND count(*) FILTER (WHERE l.trade_type = 'buy'
                                    AND n.remaining_quantity IS DISTINCT FROM l.remaining_quantity::numeric(20,8)) = 0
             AND count(*) FILTER (WHERE l.trade_type = 'sell'
                                    AND n.realized_gain IS DISTINCT FROM l.realized_gain::bigint) = 0
            THEN 'PASS' ELSE 'FAIL' END AS result
FROM legacy.investment_trades l
LEFT JOIN public.investment_trades n ON n.id = legacy.to_uuid(l.id);
SQL

run_check "### 3.2 건별 불일치 상세 (0행 = PASS)" <<'SQL'
SELECT l.id, l.ticker, l.trade_type,
       l.remaining_quantity AS legacy_rq, n.remaining_quantity AS new_rq,
       l.realized_gain      AS legacy_rg, n.realized_gain      AS new_rg,
       'FAIL' AS result
FROM legacy.investment_trades l
JOIN public.investment_trades n ON n.id = legacy.to_uuid(l.id)
WHERE (l.trade_type = 'buy'  AND n.remaining_quantity <> l.remaining_quantity)
   OR (l.trade_type = 'sell' AND n.realized_gain      <> l.realized_gain);
SQL

run_check "### 3.3 CHECK 보정으로 0 강제된 행 (sell.remaining / buy·dividend.gain — 보고용)" <<'SQL'
SELECT l.id, l.ticker, l.trade_type, l.date,
       l.remaining_quantity AS legacy_rq, l.realized_gain AS legacy_rg,
       'WARN(신 CHECK 보정: 0 강제)' AS note
FROM legacy.investment_trades l
WHERE (l.trade_type <> 'buy'  AND l.remaining_quantity <> 0)
   OR (l.trade_type <> 'sell' AND l.realized_gain <> 0);
SQL

run_check "### 3.4 종목별 FIFO 불변식 (Σ잔여 == Σ매수 − Σ매도)" <<'SQL'
SELECT ticker,
       COALESCE(SUM(quantity)           FILTER (WHERE trade_type = 'buy'),  0) AS bought,
       COALESCE(SUM(quantity)           FILTER (WHERE trade_type = 'sell'), 0) AS sold,
       COALESCE(SUM(remaining_quantity) FILTER (WHERE trade_type = 'buy'),  0) AS remaining,
       COALESCE(SUM(quantity) FILTER (WHERE trade_type = 'buy'), 0)
         - COALESCE(SUM(quantity) FILTER (WHERE trade_type = 'sell'), 0)
         - COALESCE(SUM(remaining_quantity) FILTER (WHERE trade_type = 'buy'), 0) AS drift,
       CASE WHEN COALESCE(SUM(remaining_quantity) FILTER (WHERE trade_type = 'buy'), 0)
               = COALESCE(SUM(quantity) FILTER (WHERE trade_type = 'buy'),  0)
               - COALESCE(SUM(quantity) FILTER (WHERE trade_type = 'sell'), 0)
            THEN 'PASS' ELSE 'FAIL' END AS result
FROM public.investment_trades
GROUP BY asset_id, ticker
ORDER BY (COALESCE(SUM(remaining_quantity) FILTER (WHERE trade_type = 'buy'), 0)
        = COALESCE(SUM(quantity) FILTER (WHERE trade_type = 'buy'),  0)
        - COALESCE(SUM(quantity) FILTER (WHERE trade_type = 'sell'), 0)), ticker;
SQL

run_check "### 3.5 FIFO 대사 요약 (public 에 매매 데이터 존재 + 불변식 위반 0)" <<'SQL'
WITH inv AS (
  SELECT COALESCE(SUM(remaining_quantity) FILTER (WHERE trade_type = 'buy'), 0)
       - (COALESCE(SUM(quantity) FILTER (WHERE trade_type = 'buy'),  0)
        - COALESCE(SUM(quantity) FILTER (WHERE trade_type = 'sell'), 0)) AS drift
  FROM public.investment_trades
  GROUP BY asset_id, ticker
)
SELECT (SELECT count(*) FROM public.investment_trades) AS new_trades,
       (SELECT count(*) FROM legacy.investment_trades)  AS legacy_trades,
       count(*) FILTER (WHERE drift <> 0) AS invariant_violations,
       CASE WHEN (SELECT count(*) FROM public.investment_trades)
               = (SELECT count(*) FROM legacy.investment_trades)
             AND count(*) FILTER (WHERE drift <> 0) = 0
            THEN 'PASS' ELSE 'FAIL' END AS result
FROM inv;
SQL

# ──────────────────────────────────────────────────────────────
echo "## 4. 결산 대사 (§5.4 — 최근 3개월 + 저축·카드결제 표본 강제 포함)"
echo

run_check "### 4.1 대사 표본 월 (recent 3 + saving + card_payment)" <<'SQL'
WITH months AS (
  SELECT DISTINCT ym, string_agg(src, '+') OVER (PARTITION BY ym) AS sources FROM (
    SELECT to_char((date_trunc('month', now() AT TIME ZONE 'Asia/Seoul') - make_interval(months => g))::date, 'YYYY-MM') AS ym,
           'recent3' AS src
    FROM generate_series(1, 3) g
    UNION ALL
    SELECT max(to_char(t.date, 'YYYY-MM')), 'saving'
    FROM legacy.transactions t
    WHERE t.type = 'expense' AND t.to_account_id IS NOT NULL AND t.status = 'applied'
    UNION ALL
    SELECT max(to_char(t.date, 'YYYY-MM')), 'card_payment'
    FROM legacy.transactions t
    JOIN legacy.accounts ca ON ca.id = t.to_account_id
    WHERE t.type = 'transfer' AND ca.type = 'card' AND t.status = 'applied'
  ) m WHERE ym IS NOT NULL
)
SELECT ym, sources FROM months ORDER BY ym;
SQL

run_check "### 4.2 월×대분류×type 필드 단위 비교 (0행 = PASS)" <<'SQL'
WITH months AS (
  SELECT DISTINCT ym FROM (
    SELECT to_char((date_trunc('month', now() AT TIME ZONE 'Asia/Seoul') - make_interval(months => g))::date, 'YYYY-MM') AS ym
    FROM generate_series(1, 3) g
    UNION ALL
    SELECT max(to_char(t.date, 'YYYY-MM'))
    FROM legacy.transactions t
    WHERE t.type = 'expense' AND t.to_account_id IS NOT NULL AND t.status = 'applied'
    UNION ALL
    SELECT max(to_char(t.date, 'YYYY-MM'))
    FROM legacy.transactions t
    JOIN legacy.accounts ca ON ca.id = t.to_account_id
    WHERE t.type = 'transfer' AND ca.type = 'card' AND t.status = 'applied'
  ) m WHERE ym IS NOT NULL
),
legacy_s AS (
  SELECT to_char(t.date, 'YYYY-MM') AS ym,
         COALESCE(c.parent_id, c.id) AS category_key,   -- text id
         t.type,
         SUM(t.amount)::bigint AS amount
  FROM legacy.transactions t
  LEFT JOIN legacy.categories c ON t.category_id = c.id
  WHERE to_char(t.date, 'YYYY-MM') IN (SELECT ym FROM months)
    AND t.type IN ('income', 'expense')
    AND t.status = 'applied'
  GROUP BY 1, 2, 3
),
new_s AS (
  SELECT to_char(t.date, 'YYYY-MM') AS ym,
         COALESCE(c.parent_id, c.id) AS category_key,   -- uuid
         t.type,
         SUM(t.amount)::bigint AS amount
  FROM public.transactions t
  LEFT JOIN public.categories c ON t.category_id = c.id
  WHERE to_char(t.date, 'YYYY-MM') IN (SELECT ym FROM months)
    AND t.type IN ('income', 'expense')
    AND t.status = 'applied'
  GROUP BY 1, 2, 3
)
SELECT COALESCE(l.ym, n.ym) AS ym,
       COALESCE(legacy.to_uuid(l.category_key)::text, n.category_key::text) AS category,
       COALESCE(l.type, n.type) AS type,
       l.amount AS legacy_amount,
       n.amount AS new_amount,
       COALESCE(n.amount, 0) - COALESCE(l.amount, 0) AS diff,
       'FAIL' AS result
FROM legacy_s l
FULL OUTER JOIN new_s n
  ON n.ym = l.ym AND n.type = l.type
 AND n.category_key = legacy.to_uuid(l.category_key)
WHERE COALESCE(l.amount, 0) <> COALESCE(n.amount, 0)
ORDER BY ym, type;
SQL

run_check "### 4.3 월별 총수입/총지출 비교 (legacy 직접 집계 vs 신 DB 직접 집계 vs get_monthly_settlement RPC)" <<'SQL'
WITH months AS (
  SELECT DISTINCT ym FROM (
    SELECT to_char((date_trunc('month', now() AT TIME ZONE 'Asia/Seoul') - make_interval(months => g))::date, 'YYYY-MM') AS ym
    FROM generate_series(1, 3) g
    UNION ALL
    SELECT max(to_char(t.date, 'YYYY-MM'))
    FROM legacy.transactions t
    WHERE t.type = 'expense' AND t.to_account_id IS NOT NULL AND t.status = 'applied'
    UNION ALL
    SELECT max(to_char(t.date, 'YYYY-MM'))
    FROM legacy.transactions t
    JOIN legacy.accounts ca ON ca.id = t.to_account_id
    WHERE t.type = 'transfer' AND ca.type = 'card' AND t.status = 'applied'
  ) m WHERE ym IS NOT NULL
),
l AS (
  SELECT to_char(date, 'YYYY-MM') AS ym,
         COALESCE(SUM(amount) FILTER (WHERE type = 'income'),  0)::bigint AS income,
         COALESCE(SUM(amount) FILTER (WHERE type = 'expense'), 0)::bigint AS expense
  FROM legacy.transactions
  WHERE status = 'applied' AND type IN ('income', 'expense')
  GROUP BY 1
),
n AS (
  SELECT to_char(date, 'YYYY-MM') AS ym,
         COALESCE(SUM(amount) FILTER (WHERE type = 'income'),  0)::bigint AS income,
         COALESCE(SUM(amount) FILTER (WHERE type = 'expense'), 0)::bigint AS expense
  FROM public.transactions
  WHERE status = 'applied' AND type IN ('income', 'expense')
  GROUP BY 1
),
r AS (
  SELECT m.ym,
         public.get_monthly_settlement(split_part(m.ym, '-', 1)::int,
                                       split_part(m.ym, '-', 2)::int) AS js
  FROM months m
)
SELECT m.ym,
       COALESCE(l.income, 0)  AS legacy_income,
       COALESCE(n.income, 0)  AS new_income,
       (r.js->>'total_income')::bigint  AS rpc_income,
       COALESCE(l.expense, 0) AS legacy_expense,
       COALESCE(n.expense, 0) AS new_expense,
       (r.js->>'total_expense')::bigint AS rpc_expense,
       CASE WHEN COALESCE(l.income, 0)  = COALESCE(n.income, 0)
             AND COALESCE(l.income, 0)  = COALESCE((r.js->>'total_income')::bigint,  -1)
             AND COALESCE(l.expense, 0) = COALESCE(n.expense, 0)
             AND COALESCE(l.expense, 0) = COALESCE((r.js->>'total_expense')::bigint, -1)
            THEN 'PASS' ELSE 'FAIL' END AS result
FROM months m
LEFT JOIN l ON l.ym = m.ym
LEFT JOIN n ON n.ym = m.ym
LEFT JOIN r ON r.ym = m.ym
ORDER BY m.ym;
SQL

# ──────────────────────────────────────────────────────────────
echo "## 종합"
echo
if [ "$FAIL_COUNT" -eq 0 ]; then
  echo "**결과: ALL PASS** (FAIL 0건)"
else
  echo "**결과: FAIL ${FAIL_COUNT}건** — 위 표에서 FAIL 행 확인"
fi
echo

exit $([ "$FAIL_COUNT" -eq 0 ] && echo 0 || echo 1)
