-- transform.sql — legacy → public 변환 (MIGRATION.md §3 적재 순서, §4 테이블별 SQL)
--
-- 사용법:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/migration/transform.sql
--
-- 전제: legacy 스키마 적재 완료(§1.3), public 에 신 스키마 적용 완료(supabase db reset).
-- 멱등성: 전 INSERT ... ON CONFLICT DO NOTHING / 2-pass UPDATE 는 자연 멱등 — 재실행 안전.
\set ON_ERROR_STOP on

\ir 00_to_uuid.sql

BEGIN;

-- ────────────────────────────────────────────────
-- 1. asset_categories (§4.1)
-- ────────────────────────────────────────────────
INSERT INTO public.asset_categories (id, name, kind, icon, color, sort_order, created_at, updated_at)
SELECT legacy.to_uuid(id), name, kind, icon, color, sort_order, created_at, updated_at
FROM legacy.asset_categories
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────
-- 2. assets (§4.2 — current_value 이관 안 함: §5.2 대사용)
-- ────────────────────────────────────────────────
INSERT INTO public.assets (id, name, asset_category_id, acquisition_date, acquisition_cost,
                           institution, memo, is_active, metadata, created_at, updated_at)
SELECT legacy.to_uuid(id), name, legacy.to_uuid(asset_category_id), acquisition_date,
       acquisition_cost::bigint,
       institution, memo, is_active, metadata, created_at, updated_at
FROM legacy.assets
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────
-- 3. categories (§4.3 — 2-pass: parent_id)
-- ────────────────────────────────────────────────
INSERT INTO public.categories (id, name, type, expense_kind, icon, color,
                               parent_id, sort_order, is_active, created_at, updated_at)
SELECT legacy.to_uuid(id), name, type,
       -- 신 CHECK 보정: expense 인데 expense_kind NULL 인 레거시 행은 'consumption' 기본값
       CASE WHEN type = 'expense' THEN COALESCE(expense_kind, 'consumption') ELSE NULL END,
       icon, color, NULL, sort_order, is_active, created_at, updated_at
FROM legacy.categories
ON CONFLICT (id) DO NOTHING;

UPDATE public.categories n
SET parent_id = legacy.to_uuid(l.parent_id)
FROM legacy.categories l
WHERE n.id = legacy.to_uuid(l.id) AND l.parent_id IS NOT NULL;

-- ────────────────────────────────────────────────
-- 4. accounts (§4.4 — current_balance 이관 안 함, 2-pass: linked_account_id)
-- ────────────────────────────────────────────────
INSERT INTO public.accounts (id, name, type, initial_balance, color, icon, is_active, sort_order,
                             asset_id, deposit_type, term_months, interest_rate, tax_type,
                             open_date, monthly_payment, billing_day, credit_limit,
                             linked_account_id, created_at, updated_at)
SELECT legacy.to_uuid(id), name, type, initial_balance::bigint,
       color, icon, is_active, sort_order,
       legacy.to_uuid(asset_id), deposit_type, term_months, interest_rate, tax_type,
       open_date, monthly_payment::bigint, billing_day, credit_limit::bigint,
       NULL, created_at, updated_at
FROM legacy.accounts
ON CONFLICT (id) DO NOTHING;

UPDATE public.accounts n
SET linked_account_id = legacy.to_uuid(l.linked_account_id)
FROM legacy.accounts l
WHERE n.id = legacy.to_uuid(l.id) AND l.linked_account_id IS NOT NULL;

-- ────────────────────────────────────────────────
-- 5. tags (§4.5)
-- ────────────────────────────────────────────────
INSERT INTO public.tags (id, name, color, created_at)
SELECT legacy.to_uuid(id), name, color, created_at
FROM legacy.tags
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────
-- 6. recurring_transactions (§4.6 — interval → recur_interval)
-- ────────────────────────────────────────────────
INSERT INTO public.recurring_transactions (id, type, amount, description, category_id, account_id,
                                           to_account_id, frequency, recur_interval,
                                           start_date, end_date, next_date, is_active,
                                           created_at, updated_at)
SELECT legacy.to_uuid(id), type, amount::bigint, description,
       legacy.to_uuid(category_id), legacy.to_uuid(account_id), legacy.to_uuid(to_account_id),
       frequency, "interval",
       start_date, end_date, next_date, is_active, created_at, updated_at
FROM legacy.recurring_transactions
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────
-- 7. transactions (§4.7 — 저축=expense+to_account_id 무변환 이관, 자기이체 오염 행 제외)
-- ────────────────────────────────────────────────
INSERT INTO public.transactions (id, type, amount, description, status, category_id, account_id,
                                 to_account_id, recurring_id, date, memo,
                                 installment_months, installment_current, created_at, updated_at)
SELECT legacy.to_uuid(id), type, amount::bigint, description, status,
       legacy.to_uuid(category_id), legacy.to_uuid(account_id), legacy.to_uuid(to_account_id),
       legacy.to_uuid(recurring_id), date, memo,
       installment_months, installment_current, created_at, updated_at
FROM legacy.transactions
-- 신 CHECK(chk_tx_no_self_transfer) 위반 예방 — 제외 건수는 reconcile.sh §1.2 에서 자동 검증
WHERE to_account_id IS NULL OR to_account_id <> account_id
ON CONFLICT (id) DO NOTHING;

-- 제외된 오염 행 보고 (0건이어야 정상)
\echo '--- 자기이체 오염으로 제외된 transactions (0행 = 정상):'
SELECT id, type, date, amount FROM legacy.transactions
WHERE to_account_id IS NOT NULL AND to_account_id = account_id;

-- ────────────────────────────────────────────────
-- 8. transaction_tags (§4.8)
-- ────────────────────────────────────────────────
INSERT INTO public.transaction_tags (transaction_id, tag_id)
SELECT legacy.to_uuid(transaction_id), legacy.to_uuid(tag_id)
FROM legacy.transaction_tags lt
WHERE EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = legacy.to_uuid(lt.transaction_id))
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────
-- 9. budgets / budget_items (§4.9 — total_* 이관 안 함: budget_totals_v 파생)
-- ────────────────────────────────────────────────
INSERT INTO public.budgets (id, name, year, month, memo, created_at, updated_at)
SELECT legacy.to_uuid(id), name, year, month, memo, created_at, updated_at
FROM legacy.budgets
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.budget_items (id, budget_id, category_id, planned_amount, memo, created_at, updated_at)
SELECT legacy.to_uuid(id), legacy.to_uuid(budget_id), legacy.to_uuid(category_id),
       planned_amount::bigint, memo, created_at, updated_at
FROM legacy.budget_items
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────
-- 10. asset_valuations (§4.10)
-- ────────────────────────────────────────────────
INSERT INTO public.asset_valuations (id, asset_id, date, value, source, memo, created_at, updated_at)
SELECT legacy.to_uuid(id), legacy.to_uuid(asset_id), date, value::bigint, source, memo,
       created_at, updated_at
FROM legacy.asset_valuations
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────
-- 11. investment_trades (§4.11 — FIFO 상태 그대로 이관 + 신 CHECK 보정)
-- ────────────────────────────────────────────────
INSERT INTO public.investment_trades (id, asset_id, trade_type, date, ticker, quantity, unit_price,
                                      total_amount, fee, tax, net_amount, memo, account_id,
                                      remaining_quantity, realized_gain, created_at, updated_at)
SELECT legacy.to_uuid(id), legacy.to_uuid(asset_id), trade_type, date, ticker,
       quantity::numeric(20,8), unit_price::bigint, total_amount::bigint,
       fee::bigint, tax::bigint, net_amount::bigint, memo, legacy.to_uuid(account_id),
       -- 신 CHECK(chk_trades_remaining_buy_only / chk_trades_gain_sell_only) 보정
       CASE WHEN trade_type = 'buy'  THEN remaining_quantity::numeric(20,8) ELSE 0 END,
       CASE WHEN trade_type = 'sell' THEN realized_gain::bigint             ELSE 0 END,
       created_at, updated_at
FROM legacy.investment_trades
ON CONFLICT (id) DO NOTHING;

-- CHECK 보정으로 값이 0 강제된 행 보고 (reconcile.sh §3.3 과 동일 — 실행 로그 기록용)
\echo '--- 신 CHECK 보정으로 0 강제된 investment_trades (보고용):'
SELECT id, ticker, trade_type, date, remaining_quantity AS legacy_rq, realized_gain AS legacy_rg
FROM legacy.investment_trades
WHERE (trade_type <> 'buy'  AND remaining_quantity <> 0)
   OR (trade_type <> 'sell' AND realized_gain <> 0);

-- ────────────────────────────────────────────────
-- 12. forecast_scenarios / forecast_results (§4.12)
-- ────────────────────────────────────────────────
INSERT INTO public.forecast_scenarios (id, name, description, assumptions, start_date, end_date,
                                       created_at, updated_at)
SELECT legacy.to_uuid(id), name, description, assumptions, start_date, end_date,
       created_at, updated_at
FROM legacy.forecast_scenarios
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.forecast_results (id, scenario_id, date, projected_income, projected_expense,
                                     projected_balance, projected_net_worth, details,
                                     created_at, updated_at)
SELECT legacy.to_uuid(id), legacy.to_uuid(scenario_id), date,
       projected_income::bigint, projected_expense::bigint,
       projected_balance::bigint, projected_net_worth::bigint,
       details, created_at, updated_at
FROM legacy.forecast_results
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ────────────────────────────────────────────────
-- investment_returns: 이관 제외(§4.14) — legacy 보존 확인만
-- ────────────────────────────────────────────────
\echo '--- investment_returns 보존(이관 제외) 확인:'
SELECT count(*) AS preserved_rows FROM legacy.investment_returns;
\echo '--- 수동 입력분(unrealized_gain/return_rate) — 보존 기간 내 사용자 검토 대상:'
SELECT asset_id, year, month, unrealized_gain, return_rate, memo
FROM legacy.investment_returns
WHERE unrealized_gain <> 0 OR COALESCE(return_rate, 0) <> 0;

-- legacy PK 포맷 분포 기록 (§2 — UUID 직접 캐스팅 분기 실효성 검증)
\echo '--- legacy PK 포맷 분포:'
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
