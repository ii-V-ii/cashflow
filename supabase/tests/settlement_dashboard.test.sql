-- pgTAP: Phase 2B 결산·대시보드 RPC — 시그니처·권한·도메인 규칙 검증
-- 실행: supabase test db (docs/DB.md §3.9-3.10, docs/API.md §7·§8)
-- 도메인 규칙: 저축 포함 / applied만 / 대분류 롤업 / 전월 비교 / 캘린더 pending 제외
begin;

create extension if not exists pgtap with schema extensions;

select plan(32);

-- ── 함수 시그니처 ────────────────────────────────────────────
select has_function('public', 'get_monthly_settlement', array['integer', 'integer']);
select has_function('public', 'get_annual_settlement', array['integer']);
select has_function('public', 'get_dashboard', array['integer', 'integer']);

-- SECURITY INVOKER 확인 (DB.md §3: 투자 RPC 2종 외 전부 INVOKER)
select is(
  (select prosecdef from pg_proc
    where proname = 'get_monthly_settlement' and pronamespace = 'public'::regnamespace),
  false, 'get_monthly_settlement is SECURITY INVOKER');
select is(
  (select prosecdef from pg_proc
    where proname = 'get_annual_settlement' and pronamespace = 'public'::regnamespace),
  false, 'get_annual_settlement is SECURITY INVOKER');
select is(
  (select prosecdef from pg_proc
    where proname = 'get_dashboard' and pronamespace = 'public'::regnamespace),
  false, 'get_dashboard is SECURITY INVOKER');

-- ── 권한: anon 차단 + authenticated 허용 ─────────────────────
select ok(not has_function_privilege('anon', 'public.get_dashboard(integer,integer)', 'EXECUTE'),
  'anon cannot execute get_dashboard');
select ok(has_function_privilege('authenticated', 'public.get_dashboard(integer,integer)', 'EXECUTE'),
  'authenticated can execute get_dashboard');
select ok(has_function_privilege('authenticated', 'public.get_monthly_settlement(integer,integer)', 'EXECUTE'),
  'authenticated can execute get_monthly_settlement');
select ok(has_function_privilege('authenticated', 'public.get_annual_settlement(integer)', 'EXECUTE'),
  'authenticated can execute get_annual_settlement');

-- ── 시드 (트랜잭션 내 — 커밋 없음) ───────────────────────────
insert into public.accounts (id, name, type, initial_balance, sort_order) values
  ('00000000-0000-4000-8000-000000000001', '은행', 'bank', 100000, 0),
  ('00000000-0000-4000-8000-000000000002', '적금', 'savings', 0, 1);

insert into public.categories (id, name, type, expense_kind, parent_id) values
  ('00000000-0000-4000-8000-000000000101', '급여', 'income', null, null),
  ('00000000-0000-4000-8000-000000000102', '식비', 'expense', 'consumption', null),
  ('00000000-0000-4000-8000-000000000103', '저축', 'expense', 'saving', null);
-- 소분류(외식 → 부모 식비): 대분류 롤업 검증용. expense_kind는 CHECK로 필수.
insert into public.categories (id, name, type, expense_kind, parent_id) values
  ('00000000-0000-4000-8000-000000000104', '외식', 'expense', 'consumption',
   '00000000-0000-4000-8000-000000000102');

insert into public.transactions (type, amount, description, status, category_id, account_id, to_account_id, date) values
  -- 6월 (전월): 수입 300,000 / 지출 50,000
  ('income',  300000, '전월급여', 'applied', '00000000-0000-4000-8000-000000000101',
   '00000000-0000-4000-8000-000000000001', null, '2026-06-05'),
  ('expense',  50000, '전월식비', 'applied', '00000000-0000-4000-8000-000000000102',
   '00000000-0000-4000-8000-000000000001', null, '2026-06-10'),
  -- 7월 (당월): 수입 500,000
  ('income',  500000, '급여', 'applied', '00000000-0000-4000-8000-000000000101',
   '00000000-0000-4000-8000-000000000001', null, '2026-07-01'),
  -- 7월 지출: 식비(대분류) 30,000 + 외식(소분류→식비 롤업) 20,000
  ('expense',  30000, '장보기', 'applied', '00000000-0000-4000-8000-000000000102',
   '00000000-0000-4000-8000-000000000001', null, '2026-07-03'),
  ('expense',  20000, '외식', 'applied', '00000000-0000-4000-8000-000000000104',
   '00000000-0000-4000-8000-000000000001', null, '2026-07-05'),
  -- 7월 저축 거래: expense + saving 카테고리 + 입금 계좌 → 지출 총계 포함
  ('expense', 100000, '적금이체', 'applied', '00000000-0000-4000-8000-000000000103',
   '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '2026-07-10'),
  -- 7월 pending: 결산·캘린더에서 제외되어야 함
  ('expense', 999999, '예정지출', 'pending', '00000000-0000-4000-8000-000000000102',
   '00000000-0000-4000-8000-000000000001', null, '2026-07-20');

-- ── get_monthly_settlement 도메인 규칙 ───────────────────────
select is(
  (public.get_monthly_settlement(2026, 7)->>'total_income')::bigint, 500000::bigint,
  'monthly: total_income = 500,000');
-- 저축 100,000 포함 + pending 999,999 제외 → 30,000+20,000+100,000
select is(
  (public.get_monthly_settlement(2026, 7)->>'total_expense')::bigint, 150000::bigint,
  'monthly: total_expense includes saving, excludes pending');
select is(
  (public.get_monthly_settlement(2026, 7)->>'net_income')::bigint, 350000::bigint,
  'monthly: net_income = income - expense');

-- 대분류 롤업: 외식(소분류)이 식비로 합산 → expense_by_category 는 식비 50,000 + 저축 100,000 = 2행
select is(
  jsonb_array_length(public.get_monthly_settlement(2026, 7)->'expense_by_category'), 2,
  'monthly: child category rolls up to parent (2 expense rows)');
select is(
  (select elem->>'amount' from jsonb_array_elements(
     public.get_monthly_settlement(2026, 7)->'expense_by_category') elem
    where elem->>'category_name' = '식비'), '50000',
  'monthly: 식비 rollup = 30,000 + 20,000(외식)');
select is(
  (select elem->>'expense_kind' from jsonb_array_elements(
     public.get_monthly_settlement(2026, 7)->'expense_by_category') elem
    where elem->>'category_name' = '저축'), 'saving',
  'monthly: expense_by_category exposes expense_kind for saving split');

-- 전월 비교
select is(
  (public.get_monthly_settlement(2026, 7)->'previous_month'->>'income')::bigint, 300000::bigint,
  'monthly: previous_month.income = 300,000');
select is(
  (public.get_monthly_settlement(2026, 7)->'previous_month'->>'expense')::bigint, 50000::bigint,
  'monthly: previous_month.expense = 50,000');

-- 계좌별 기초/기말: 은행 기초 = 100,000(초기) + 전월(300,000 - 50,000) = 350,000
select is(
  (select elem->>'opening_balance' from jsonb_array_elements(
     public.get_monthly_settlement(2026, 7)->'account_changes') elem
    where elem->>'name' = '은행'), '350000',
  'monthly: bank opening = initial + pre-month effects');
-- 은행 기말 = 350,000 + 500,000 - (30,000+20,000+100,000) = 700,000
select is(
  (select elem->>'closing_balance' from jsonb_array_elements(
     public.get_monthly_settlement(2026, 7)->'account_changes') elem
    where elem->>'name' = '은행'), '700000',
  'monthly: bank closing = opening + in - out');
-- 적금 기말 = 0 + 저축 입금 100,000 (저축 거래의 to_account 입금 반영)
select is(
  (select elem->>'closing_balance' from jsonb_array_elements(
     public.get_monthly_settlement(2026, 7)->'account_changes') elem
    where elem->>'name' = '적금'), '100000',
  'monthly: savings account receives saving deposit');

-- ── get_annual_settlement ────────────────────────────────────
select is(
  (select elem->>'income' from jsonb_array_elements(
     public.get_annual_settlement(2026)->'months') elem
    where (elem->>'month')::int = 7), '500000',
  'annual: July income = 500,000');
select is(
  (select elem->>'saving' from jsonb_array_elements(
     public.get_annual_settlement(2026)->'months') elem
    where (elem->>'month')::int = 7), '100000',
  'annual: July saving = 100,000 (saving-kind rollup)');
-- 연간 카테고리 롤업: 식비 = 50,000(6월) + 50,000(7월)
select is(
  (select elem->>'amount' from jsonb_array_elements(
     public.get_annual_settlement(2026)->'by_category') elem
    where elem->>'category_name' = '식비'), '100000',
  'annual: 식비 yearly rollup across months');

-- ── get_dashboard ────────────────────────────────────────────
select is(
  (public.get_dashboard(2026, 7)->>'month_income')::bigint, 500000::bigint,
  'dashboard: month_income = 500,000');
select is(
  (public.get_dashboard(2026, 7)->>'month_expense')::bigint, 150000::bigint,
  'dashboard: month_expense includes saving, excludes pending');
-- 총잔액: 은행 700,000 + 적금 100,000 (pending 999,999 미반영)
select is(
  (public.get_dashboard(2026, 7)->>'total_balance')::bigint, 800000::bigint,
  'dashboard: total_balance from account_balances_v (applied only)');
-- 캘린더: applied 거래 일자 4일만 (pending 07-20 제외)
select is(
  jsonb_array_length(public.get_dashboard(2026, 7)->'calendar'), 4,
  'dashboard: calendar has applied-only days (pending excluded)');
select ok(
  not exists (
    select 1 from jsonb_array_elements(public.get_dashboard(2026, 7)->'calendar') elem
    where elem->>'date' = '2026-07-20'),
  'dashboard: pending date absent from calendar');
-- 타 트랙 뷰 의존 섹션은 null placeholder
select is(public.get_dashboard(2026, 7)->'investment', 'null'::jsonb,
  'dashboard: investment is null placeholder until 2C lands');
select is(public.get_dashboard(2026, 7)->'budget_usage', 'null'::jsonb,
  'dashboard: budget_usage is null placeholder until 2A lands');
-- 최근 거래 5건 제한 (총 applied 6 + pending 1 = 7건 중 5건)
select is(
  jsonb_array_length(public.get_dashboard(2026, 7)->'recent_transactions'), 5,
  'dashboard: recent_transactions capped at 5');

select * from finish();
rollback;
