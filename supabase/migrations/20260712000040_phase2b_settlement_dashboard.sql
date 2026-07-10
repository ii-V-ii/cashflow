-- Phase 2B: 결산·대시보드 RPC — get_monthly_settlement / get_annual_settlement / get_dashboard
-- 스펙: docs/DB.md §3.9(get_dashboard), §3.10(get_monthly_settlement), docs/API.md §7·§8
--
-- 의존성 주의(단독 db reset 성공 필수):
--   이 마이그레이션은 Phase 1 거래 코어(transactions/accounts/categories,
--   account_balances_v, transaction_json)만 참조한다. 예산(budget_totals_v)·
--   투자(monthly_investment_summary_v)·자산(asset_values_v) 뷰는 타 트랙에서
--   랜딩되므로 여기서는 참조하지 않고 null placeholder 로 반환한다 —
--   Phase 2 통합에서 get_dashboard 를 CREATE OR REPLACE 로 확장한다.
--
-- 보고서(API.md §14) 3종은 현재 src/server/services/report-service.ts 의 읽기 전용
-- SELECT(각 1왕복)로 구현되어 있다 — RPC-first 관례와의 정합을 위해 Phase 2 통합에서
-- RPC(get_trend_report 등)로의 이전을 검토한다.

-- ============================================================
-- 1. get_monthly_settlement(p_year, p_month) → jsonb (DB.md §3.10)
--    - 대분류 롤업: COALESCE(c.parent_id, c.id) / 소분류는 부모 expense_kind 상속
--    - 저축(type='expense' + expense_kind='saving') 포함, transfer 제외
--    - 배당(investment_trades)은 transactions 에 없으므로 총수입 미포함(확정 동작)
--    - status='applied' 만 집계
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_monthly_settlement(p_year integer, p_month integer)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
WITH bounds AS (
  SELECT make_date(p_year, p_month, 1)                                AS v_start,
         (make_date(p_year, p_month, 1) + interval '1 month')::date   AS v_end,
         (make_date(p_year, p_month, 1) - interval '1 month')::date   AS v_prev_start
),
-- (1) 카테고리 집계: 대분류 롤업
category_totals AS (
  SELECT COALESCE(c.parent_id, c.id)               AS category_id,
         COALESCE(pc.name, c.name, '미분류')        AS category_name,
         t.type,
         COALESCE(pc.expense_kind, c.expense_kind) AS expense_kind,
         SUM(t.amount)::bigint                     AS amount
  FROM transactions t
  LEFT JOIN categories c  ON c.id = t.category_id
  LEFT JOIN categories pc ON pc.id = c.parent_id
  CROSS JOIN bounds b
  WHERE t.date >= b.v_start AND t.date < b.v_end
    AND t.type IN ('income', 'expense')   -- 저축은 expense 이므로 자동 포함
    AND t.status = 'applied'
  GROUP BY 1, 2, 3, 4
),
totals AS (
  SELECT COALESCE(SUM(amount) FILTER (WHERE type = 'income'),  0)::bigint AS total_income,
         COALESCE(SUM(amount) FILTER (WHERE type = 'expense'), 0)::bigint AS total_expense
  FROM category_totals
),
-- (2) 계좌별 기초/기말 — 기초 = initial_balance + 월 시작 전 누적 효과
--     (account_balances_v 와 동일한 UNION ALL 패턴 + date < v_start 조건.
--      투자 매매 효과는 investment_trades 랜딩 후 Phase 2 통합에서 확장 — DB.md §3.10)
--     [성능 주석] pre_effects 는 월 시작 전 전체 이력을 스캔한다(수용된 위험 — 단일
--     사용자 규모). 실측 게이트: 3만 건 시드 EXPLAIN 캡처(docs/perf/phase2b-explain.md).
--     전환 기준: 이력 누적으로 실측이 100ms 를 넘으면 월별 마감 잔액 스냅샷 테이블
--     (예: account_month_closings)로 전환해 기초 잔액을 O(계좌 수) 조회로 대체한다.
pre_effects AS (
  SELECT e.account_id, SUM(e.effect)::bigint AS net_effect
  FROM (
    SELECT t.account_id,
           CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END AS effect
    FROM transactions t CROSS JOIN bounds b
    WHERE t.status = 'applied' AND t.date < b.v_start
    UNION ALL
    SELECT t.to_account_id, t.amount
    FROM transactions t CROSS JOIN bounds b
    WHERE t.status = 'applied' AND t.date < b.v_start
      AND t.to_account_id IS NOT NULL AND t.type IN ('transfer', 'expense')
  ) e
  GROUP BY e.account_id
),
-- 월중 입금: income + (transfer/저축성 expense 의 to_account 입금)
month_in AS (
  SELECT e.account_id, SUM(e.amount)::bigint AS amount
  FROM (
    SELECT t.account_id, t.amount
    FROM transactions t CROSS JOIN bounds b
    WHERE t.status = 'applied' AND t.date >= b.v_start AND t.date < b.v_end
      AND t.type = 'income'
    UNION ALL
    SELECT t.to_account_id, t.amount
    FROM transactions t CROSS JOIN bounds b
    WHERE t.status = 'applied' AND t.date >= b.v_start AND t.date < b.v_end
      AND t.to_account_id IS NOT NULL AND t.type IN ('transfer', 'expense')
  ) e
  GROUP BY e.account_id
),
-- 월중 출금: expense + transfer 출금
month_out AS (
  SELECT t.account_id, SUM(t.amount)::bigint AS amount
  FROM transactions t CROSS JOIN bounds b
  WHERE t.status = 'applied' AND t.date >= b.v_start AND t.date < b.v_end
    AND t.type IN ('expense', 'transfer')
  GROUP BY t.account_id
),
account_changes AS (
  SELECT a.id AS account_id, a.name, a.sort_order,
         (a.initial_balance + COALESCE(pe.net_effect, 0))::bigint AS opening_balance,
         COALESCE(mi.amount, 0)::bigint AS income,
         COALESCE(mo.amount, 0)::bigint AS expense
  FROM accounts a
  LEFT JOIN pre_effects pe ON pe.account_id = a.id
  LEFT JOIN month_in    mi ON mi.account_id = a.id
  LEFT JOIN month_out   mo ON mo.account_id = a.id
  WHERE a.is_active
),
-- (3) 전월 비교
previous_month AS (
  SELECT COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'income'),  0)::bigint AS income,
         COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'expense'), 0)::bigint AS expense
  FROM transactions t CROSS JOIN bounds b
  WHERE t.status = 'applied' AND t.date >= b.v_prev_start AND t.date < b.v_start
    AND t.type IN ('income', 'expense')
)
SELECT jsonb_build_object(
  'year',  p_year,
  'month', p_month,
  'total_income',  tt.total_income,
  'total_expense', tt.total_expense,
  'net_income',    tt.total_income - tt.total_expense,
  'income_by_category', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'category_id', ct.category_id,
             'category_name', ct.category_name,
             'amount', ct.amount)
           ORDER BY ct.amount DESC, ct.category_name)
    FROM category_totals ct WHERE ct.type = 'income'), '[]'::jsonb),
  'expense_by_category', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'category_id', ct.category_id,
             'category_name', ct.category_name,
             'expense_kind', ct.expense_kind,
             'amount', ct.amount)
           ORDER BY ct.amount DESC, ct.category_name)
    FROM category_totals ct WHERE ct.type = 'expense'), '[]'::jsonb),
  'account_changes', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'account_id', ac.account_id,
             'name', ac.name,
             'opening_balance', ac.opening_balance,
             'income', ac.income,
             'expense', ac.expense,
             'closing_balance', ac.opening_balance + ac.income - ac.expense)
           ORDER BY ac.sort_order, ac.name)
    FROM account_changes ac), '[]'::jsonb),
  'previous_month', (
    SELECT jsonb_build_object(
             'income', pm.income,
             'expense', pm.expense,
             'net', pm.income - pm.expense)
    FROM previous_month pm)
)
FROM totals tt;
$$;

-- ============================================================
-- 2. get_annual_settlement(p_year) → jsonb (API.md §7.2 — 1왕복, 월 12회 호출 금지)
--    월별 수입/지출/저축 + 카테고리별(대분류 롤업) 연간 집계.
--    거래 없는 달의 0 채움은 앱 매핑 계층에서 수행(12개월 고정 배열).
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_annual_settlement(p_year integer)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
WITH bounds AS (
  SELECT make_date(p_year, 1, 1) AS v_start, make_date(p_year + 1, 1, 1) AS v_end
),
rolled AS (
  SELECT EXTRACT(MONTH FROM t.date)::int             AS month,
         COALESCE(c.parent_id, c.id)                 AS category_id,
         COALESCE(pc.name, c.name, '미분류')          AS category_name,
         t.type,
         COALESCE(pc.expense_kind, c.expense_kind)   AS expense_kind,
         SUM(t.amount)::bigint                       AS amount
  FROM transactions t
  LEFT JOIN categories c  ON c.id = t.category_id
  LEFT JOIN categories pc ON pc.id = c.parent_id
  CROSS JOIN bounds b
  WHERE t.date >= b.v_start AND t.date < b.v_end
    AND t.type IN ('income', 'expense')
    AND t.status = 'applied'
  GROUP BY 1, 2, 3, 4, 5
),
monthly AS (
  SELECT month,
         COALESCE(SUM(amount) FILTER (WHERE type = 'income'),  0)::bigint AS income,
         COALESCE(SUM(amount) FILTER (WHERE type = 'expense'), 0)::bigint AS expense,
         COALESCE(SUM(amount) FILTER (WHERE type = 'expense'
                                        AND expense_kind = 'saving'), 0)::bigint AS saving
  FROM rolled
  GROUP BY month
),
by_category AS (
  SELECT category_id, category_name, type, expense_kind, SUM(amount)::bigint AS amount
  FROM rolled
  GROUP BY 1, 2, 3, 4
)
SELECT jsonb_build_object(
  'year', p_year,
  'months', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'month', m.month, 'income', m.income,
             'expense', m.expense, 'saving', m.saving)
           ORDER BY m.month)
    FROM monthly m), '[]'::jsonb),
  'by_category', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'category_id', bc.category_id,
             'category_name', bc.category_name,
             'type', bc.type,
             'expense_kind', bc.expense_kind,
             'amount', bc.amount)
           ORDER BY bc.amount DESC, bc.category_name)
    FROM by_category bc), '[]'::jsonb)
);
$$;

-- ============================================================
-- 3. get_dashboard(p_year, p_month) → jsonb (DB.md §3.9 — 대시보드 1왕복)
--    - calendar 는 status='applied' 거래만 (pending 제외 — 확정 동작)
--    - net_worth: 자산 트랙(asset_values_v) 랜딩 전까지 활성 계좌 잔액 합계.
--      Phase 2 통합에서 CREATE OR REPLACE 로 asset_values_v 합계
--      + 자산 미연결 활성 계좌 잔액 합으로 확장한다 (DB.md §3.9).
--    - investment / budget_usage: monthly_investment_summary_v(투자 트랙)·
--      budget_totals_v(예산 트랙)가 랜딩되기 전까지 null placeholder —
--      Phase 2 통합에서 CREATE OR REPLACE 로 확장한다.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_dashboard(p_year integer, p_month integer)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
WITH bounds AS (
  SELECT make_date(p_year, p_month, 1)                              AS v_start,
         (make_date(p_year, p_month, 1) + interval '1 month')::date AS v_end
),
balances AS (
  SELECT COALESCE(SUM(current_balance), 0)::bigint AS total_balance,
         COUNT(*)::int                             AS account_count
  FROM account_balances_v
  WHERE is_active
),
month_totals AS (
  SELECT COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'income'),  0)::bigint AS month_income,
         COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'expense'), 0)::bigint AS month_expense
  FROM transactions t CROSS JOIN bounds b
  WHERE t.date >= b.v_start AND t.date < b.v_end AND t.status = 'applied'
)
SELECT jsonb_build_object(
  'total_balance', bl.total_balance,
  'account_count', bl.account_count,
  'net_worth',     bl.total_balance,   -- 자산 트랙 랜딩 후 확장 (상단 주석)
  'month_income',  mt.month_income,
  'month_expense', mt.month_expense,
  'investment',    NULL::jsonb,        -- 투자 트랙 랜딩 후 확장 (상단 주석)
  'budget_usage',  NULL::jsonb,        -- 예산 트랙 랜딩 후 확장 (상단 주석)
  'calendar', COALESCE((
    SELECT jsonb_agg(day ORDER BY day->>'date')
    FROM (
      SELECT jsonb_build_object(
               'date', to_char(t.date, 'YYYY-MM-DD'),
               'income',  COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'income'),  0),
               'expense', COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'expense'), 0)) AS day
      FROM transactions t CROSS JOIN bounds b
      WHERE t.date >= b.v_start AND t.date < b.v_end AND t.status = 'applied'
      GROUP BY t.date
    ) daily), '[]'::jsonb),
  -- 최근 거래 5건: pending 포함이 의도된 동작 — "최근 기록" 목록이므로 예정 거래도
  -- 노출하며, 거래 목록과 동일하게 status 필드로 '예정' 배지를 구분한다.
  -- transaction_json(VOLATILE)을 호출하지 않고 동일 JSON 조립을 인라인한다 —
  -- 이 함수는 같은 문장 내 선행 쓰기 가시성이 필요 없으므로 STABLE 계약을 정직하게 유지.
  'recent_transactions', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
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
             'updatedAt', t.updated_at)
           ORDER BY t.date DESC, t.created_at DESC)
    FROM (
      SELECT *
      FROM transactions
      ORDER BY date DESC, created_at DESC
      LIMIT 5
    ) t
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
    ) tg ON true), '[]'::jsonb)
)
FROM balances bl, month_totals mt;
$$;

-- ============================================================
-- 4. 권한 — 신규 함수 기본 PUBLIC EXECUTE 차단 후 authenticated 에만 허용 (DB.md §5)
-- ============================================================
REVOKE ALL ON FUNCTION
  public.get_monthly_settlement(integer, integer),
  public.get_annual_settlement(integer),
  public.get_dashboard(integer, integer)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.get_monthly_settlement(integer, integer),
  public.get_annual_settlement(integer),
  public.get_dashboard(integer, integer)
TO authenticated;
