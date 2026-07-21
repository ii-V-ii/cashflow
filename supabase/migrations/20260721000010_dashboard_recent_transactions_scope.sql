-- get_dashboard: 최근 거래 5건을 "선택 월 + 오늘(KST) 이하 날짜"로 한정한다.
-- 스펙: docs/DB.md §3.9(get_dashboard), docs/API.md §8.1
--
-- 버그: 기존 recent_transactions 서브쿼리(20260716000010)는
--   SELECT * FROM transactions ORDER BY date DESC, created_at DESC LIMIT 5
-- 로 p_year/p_month(bounds.v_start/v_end) 바인딩이 전혀 없어
--   1) 월 내비게이터로 다른 달을 봐도 항상 DB 전체 최신 5건만 노출되고,
--   2) refill_recurring_pending()(20260714000001_phase2d_recurring.sql)이
--      미리 INSERT 해 둔 "미래 날짜 pending" 정기거래가 상단을 독점한다.
-- 수정: bounds CTE 에 v_today((now() AT TIME ZONE 'Asia/Seoul')::date)를 추가하고,
--   recent_transactions 서브쿼리에 date >= v_start AND date < v_end AND date <= v_today
--   조건을 더한다. status 필터는 추가하지 않는다 — 사용자 요구는 "날짜" 기준이며,
--   과거 날짜의 pending(예: 지연 처리된 정기거래)은 거래 목록 화면과 동일하게
--   '예정' 배지로 계속 노출하는 편이 정직하다. 미래 pending은 날짜 조건만으로
--   이미 배제된다. 다른 위젯(balances/investment/budget_usage/calendar) 로직은
--   20260716000010 원본과 동일 — recent_transactions 서브쿼리만 교체한다.
CREATE OR REPLACE FUNCTION public.get_dashboard(p_year integer, p_month integer)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
WITH bounds AS (
  SELECT make_date(p_year, p_month, 1)                              AS v_start,
         (make_date(p_year, p_month, 1) + interval '1 month')::date AS v_end,
         (now() AT TIME ZONE 'Asia/Seoul')::date                    AS v_today
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
  -- 최근 거래 5건: 선택 월(v_start~v_end) 내 + 오늘(KST, v_today) 이하 날짜만.
  -- status 필터는 두지 않는다 — 과거 pending(지연 정기거래 등)은 거래 목록과 동일하게
  -- '예정' 배지로 계속 노출하는 편이 정직하며, 미래 pending은 날짜 조건으로 이미 배제된다.
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
      SELECT tr.*
      FROM transactions tr
      CROSS JOIN bounds b
      WHERE tr.date >= b.v_start AND tr.date < b.v_end AND tr.date <= b.v_today
      ORDER BY tr.date DESC, tr.created_at DESC
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
