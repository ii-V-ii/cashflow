-- Phase 2 통합: category_rollup_v 공용 뷰 + get_dashboard 확장
-- 스펙: docs/DB.md §3.9(get_dashboard), docs/API.md §8.1
--
-- 1) category_rollup_v — 대분류 롤업(COALESCE(parent_id, id)) SQL 이
--    get_monthly_settlement / get_annual_settlement / report-service(trend·categories)
--    4곳에 중복돼 있던 것을 단일 뷰로 통합한다 (2B 리뷰 M1). 동작 불변 —
--    기존 pgTAP·통합 테스트가 회귀를 방지한다.
-- 2) get_dashboard — 2B에서 null placeholder 였던 budget_usage / investment 를
--    budget_totals_v·monthly_investment_summary_v·asset_values_v 로 실계산하고,
--    net_worth 를 "자산 미연동 활성 계좌 잔액 + 활성 자산 평가액 합" 으로 확장한다
--    (자산 연동 계좌 잔액은 asset_values_v 에 포함되므로 이중 계상 방지).
--    1왕복 계약 유지.

-- ============================================================
-- 1. category_rollup_v — 거래 × 대분류 롤업 (행 단위, 집계는 호출부)
--    소분류는 부모 카테고리의 name/expense_kind/color 를 상속한다.
-- ============================================================
CREATE OR REPLACE VIEW public.category_rollup_v
WITH (security_invoker = on) AS
SELECT
  t.id                                       AS transaction_id,
  t.date,
  t.type,
  t.status,
  t.amount,
  COALESCE(c.parent_id, c.id)                AS category_id,
  COALESCE(pc.name, c.name, '미분류')         AS category_name,
  COALESCE(pc.expense_kind, c.expense_kind)  AS expense_kind,
  COALESCE(pc.color, c.color)                AS color
FROM public.transactions t
LEFT JOIN public.categories c  ON c.id = t.category_id
LEFT JOIN public.categories pc ON pc.id = c.parent_id;

GRANT SELECT ON public.category_rollup_v TO authenticated;

-- ============================================================
-- 2. get_monthly_settlement — category_totals 를 category_rollup_v 로 교체
--    (동작 불변 — 20260712000040 원본과 동일 결과)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_monthly_settlement(p_year integer, p_month integer)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
WITH bounds AS (
  SELECT make_date(p_year, p_month, 1)                                AS v_start,
         (make_date(p_year, p_month, 1) + interval '1 month')::date   AS v_end,
         (make_date(p_year, p_month, 1) - interval '1 month')::date   AS v_prev_start
),
-- (1) 카테고리 집계: 대분류 롤업 (category_rollup_v)
category_totals AS (
  SELECT r.category_id, r.category_name, r.type, r.expense_kind,
         SUM(r.amount)::bigint AS amount
  FROM category_rollup_v r
  CROSS JOIN bounds b
  WHERE r.date >= b.v_start AND r.date < b.v_end
    AND r.type IN ('income', 'expense')   -- 저축은 expense 이므로 자동 포함
    AND r.status = 'applied'
  GROUP BY 1, 2, 3, 4
),
totals AS (
  SELECT COALESCE(SUM(amount) FILTER (WHERE type = 'income'),  0)::bigint AS total_income,
         COALESCE(SUM(amount) FILTER (WHERE type = 'expense'), 0)::bigint AS total_expense
  FROM category_totals
),
-- (2) 계좌별 기초/기말 — 기초 = initial_balance + 월 시작 전 누적 효과
--     [성능 주석] pre_effects 는 월 시작 전 전체 이력을 스캔한다(수용된 위험 — 단일
--     사용자 규모). 실측 게이트: docs/perf/phase2b-explain.md. 전환 기준은 원본
--     마이그레이션(20260712000040) 주석 참조.
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
-- 3. get_annual_settlement — rolled 를 category_rollup_v 로 교체 (동작 불변)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_annual_settlement(p_year integer)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
WITH bounds AS (
  SELECT make_date(p_year, 1, 1) AS v_start, make_date(p_year + 1, 1, 1) AS v_end
),
rolled AS (
  SELECT EXTRACT(MONTH FROM r.date)::int AS month,
         r.category_id, r.category_name, r.type, r.expense_kind,
         SUM(r.amount)::bigint           AS amount
  FROM category_rollup_v r
  CROSS JOIN bounds b
  WHERE r.date >= b.v_start AND r.date < b.v_end
    AND r.type IN ('income', 'expense')
    AND r.status = 'applied'
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
-- 4. get_dashboard — 예산·투자·순자산 실계산 확장 (1왕복 유지, DB.md §3.9)
--    - budget_usage: 해당 월 예산의 지출 계획(budget_totals_v.total_expense) 대비
--      실지출(get_budget_actuals 와 동일 필터: type='expense', status='applied' —
--      저축 포함) 소진율. 해당 월 예산이 없으면 null (UI 빈 상태).
--      ratio 는 계획 0 이면 null — get_budget_actuals.achievement_rate 와 동일 규약
--      (0 을 돌려주면 계획 없는 실지출이 "계획 내"로 오독됨 — UI 가 별도 표기).
--    - investment: 해당 월 매수/매도/배당/실현손익(monthly_investment_summary_v)
--      + 활성 자산 평가액 합(asset_values_v). 활성 자산이 하나도 없으면 null
--      (totalValue 집계 대상과 동일 기준 — 전부 비활성이어도 빈 상태).
--    - net_worth: 자산 미연동 활성 계좌 잔액 + 활성 자산 평가액 합 —
--      자산 연동 계좌 잔액은 asset_values_v 에 이미 포함(이중 계상 방지).
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
-- 자산 미연동 활성 계좌 잔액 (net_worth 용 — 연동 계좌는 asset_values_v 몫)
unlinked_balances AS (
  SELECT COALESCE(SUM(ab.current_balance), 0)::bigint AS total
  FROM account_balances_v ab
  JOIN accounts a ON a.id = ab.account_id
  WHERE ab.is_active AND a.asset_id IS NULL
),
asset_total AS (
  SELECT COALESCE(SUM(current_value), 0)::bigint AS total
  FROM asset_values_v
  WHERE is_active
),
month_totals AS (
  SELECT COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'income'),  0)::bigint AS month_income,
         COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'expense'), 0)::bigint AS month_expense
  FROM transactions t CROSS JOIN bounds b
  WHERE t.date >= b.v_start AND t.date < b.v_end AND t.status = 'applied'
),
month_investment AS (
  SELECT COALESCE(SUM(invested_amount), 0)::bigint AS invested,
         COALESCE(SUM(sold_amount),     0)::bigint AS sold,
         COALESCE(SUM(dividend_income), 0)::bigint AS dividend,
         COALESCE(SUM(realized_gain),   0)::bigint AS realized_gain
  FROM monthly_investment_summary_v
  WHERE year = p_year AND month = p_month
)
SELECT jsonb_build_object(
  'total_balance', bl.total_balance,
  'account_count', bl.account_count,
  'net_worth',     ub.total + ast.total,
  'month_income',  mt.month_income,
  'month_expense', mt.month_expense,
  'investment', CASE
    WHEN NOT EXISTS (SELECT 1 FROM assets WHERE is_active) THEN NULL::jsonb
    ELSE jsonb_build_object(
      'totalValue',   ast.total,
      'invested',     mi.invested,
      'sold',         mi.sold,
      'dividend',     mi.dividend,
      'realizedGain', mi.realized_gain)
    END,
  'budget_usage', (
    SELECT jsonb_build_object(
             'plannedTotal', v.total_expense,
             'actualTotal',  mt.month_expense,
             'ratio', CASE WHEN v.total_expense > 0
                           THEN round(mt.month_expense::numeric * 100 / v.total_expense, 1)
                           ELSE NULL END)  -- 계획 0 → null (get_budget_actuals 규약)
    FROM budgets b
    JOIN budget_totals_v v ON v.budget_id = b.id
    WHERE b.year = p_year AND b.month = p_month),
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
FROM balances bl, unlinked_balances ub, asset_total ast, month_totals mt, month_investment mi;
$$;

-- CREATE OR REPLACE 는 기존 ACL(REVOKE PUBLIC + GRANT authenticated,
-- 20260712000040 §4)을 보존하므로 권한 재선언은 불필요하다.
