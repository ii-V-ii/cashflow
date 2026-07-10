-- pgTAP: Phase 2A 예산 — 스키마·제약·뷰·RPC·인덱스·RLS 검증
-- 실행: supabase test db (docs/DB.md §1.5, §2.4, §3.11-3.12, §4, §5)
begin;

create extension if not exists pgtap with schema extensions;

select plan(53);

-- ── 테이블/컬럼 ─────────────────────────────────────────────
select has_table('public'::name, 'budgets'::name);
select has_table('public'::name, 'budget_items'::name);
select col_type_is('public'::name, 'budgets'::name, 'year'::name, 'integer');
select col_type_is('public'::name, 'budgets'::name, 'month'::name, 'integer');
select col_is_null('public'::name, 'budgets'::name, 'month'::name, 'budgets.month allows NULL (연간 예산)');
select col_type_is('public'::name, 'budget_items'::name, 'planned_amount'::name, 'bigint');

-- ── 제약 ────────────────────────────────────────────────────
select ok(exists(select 1 from pg_constraint where conname = 'uq_budgets_year_month'),
  'uq_budgets_year_month exists');
select ok(
  (select i.indnullsnotdistinct
     from pg_index i
     join pg_class c on c.oid = i.indexrelid
    where c.relname = 'uq_budgets_year_month'),
  'uq_budgets_year_month is NULLS NOT DISTINCT');
select ok(exists(select 1 from pg_constraint where conname = 'uq_budget_items_budget_category'),
  'uq_budget_items_budget_category exists');

-- ── 뷰 ──────────────────────────────────────────────────────
select has_view('public'::name, 'budget_totals_v'::name, 'budget_totals_v exists');
select ok(
  (select reloptions::text ilike '%security_invoker=%on%'
     from pg_class where oid = 'public.budget_totals_v'::regclass),
  'budget_totals_v has security_invoker=on');

-- ── RPC 시그니처 ─────────────────────────────────────────────
select has_function('public', 'create_budget', array['jsonb']);
select has_function('public', 'update_budget', array['uuid', 'jsonb']);
select has_function('public', 'copy_budget', array['integer', 'integer', 'integer', 'integer']);
select has_function('public', 'upsert_budget_cell', array['integer', 'integer', 'uuid', 'bigint']);
select has_function('public', 'get_budget_actuals', array['integer', 'integer']);
select has_function('public', 'get_annual_grid', array['integer', 'text', 'text']);
select has_function('public', 'get_budget_summary', array['integer']);

-- SECURITY INVOKER 확인 (DB.md §3: 투자 RPC 2종 외 전부 INVOKER)
select is(
  (select bool_or(prosecdef) from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in ('create_budget','update_budget','copy_budget',
                      'upsert_budget_cell','get_budget_actuals',
                      'get_annual_grid','get_budget_summary','budget_json')),
  false, 'all budget functions are SECURITY INVOKER');

-- ── 인덱스 (DB.md §4, 리뷰 M3: budget_id 단독 인덱스는 uq 제약 인덱스가 커버) ──
select has_index('public'::name, 'budgets'::name, 'idx_budgets_year'::name);
select has_index('public'::name, 'budget_items'::name, 'idx_budget_items_category_id'::name);

-- ── 카테고리 깊이 불변식 트리거 (리뷰 HIGH2) ──────────────────
select ok(exists(select 1 from pg_trigger
  where tgname = 'trg_categories_max_depth'
    and tgrelid = 'public.categories'::regclass),
  'trg_categories_max_depth exists on categories');

-- ── RLS (DB.md §5) ──────────────────────────────────────────
select ok((select relrowsecurity from pg_class where oid = 'public.budgets'::regclass),
  'RLS enabled on budgets');
select ok((select relrowsecurity from pg_class where oid = 'public.budget_items'::regclass),
  'RLS enabled on budget_items');
select ok(exists(select 1 from pg_policies
  where schemaname = 'public' and tablename = 'budgets' and policyname = 'budgets_owner_all'),
  'budgets owner policy exists');
select ok(exists(select 1 from pg_policies
  where schemaname = 'public' and tablename = 'budget_items' and policyname = 'budget_items_owner_all'),
  'budget_items owner policy exists');
select ok(not has_function_privilege('anon', 'public.create_budget(jsonb)', 'EXECUTE'),
  'anon cannot execute create_budget');
select ok(not has_table_privilege('anon', 'public.budgets', 'SELECT'),
  'anon cannot select budgets');
select ok(has_function_privilege('authenticated', 'public.get_budget_actuals(integer, integer)', 'EXECUTE'),
  'authenticated can execute get_budget_actuals');

-- ── 동작: 시드 ───────────────────────────────────────────────
-- 자립성 보장: 통합 테스트 등이 남긴 커밋 데이터와의 충돌 제거
-- (트랜잭션 내 DELETE — 마지막 rollback으로 원복되므로 안전)
delete from public.budget_items;
delete from public.budgets;
delete from public.transaction_tags;
delete from public.transactions;

insert into public.categories (id, name, type, expense_kind, sort_order) values
  ('11111111-1111-4111-8111-111111111111', '식비', 'expense', 'consumption', 0),
  ('33333333-3333-4333-8333-333333333333', '저축', 'expense', 'saving', 1),
  ('44444444-4444-4444-8444-444444444444', '급여', 'income', null, 0);
insert into public.categories (id, name, type, expense_kind, parent_id, sort_order) values
  ('22222222-2222-4222-8222-222222222222', '외식', 'expense', 'consumption',
   '11111111-1111-4111-8111-111111111111', 0);
insert into public.accounts (id, name, type, initial_balance) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '은행', 'bank', 1000000),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '적금', 'savings', 0);

-- ── 동작: 카테고리 깊이 2 초과 금지 (리뷰 HIGH2) ─────────────
select throws_ok(
  $q$insert into public.categories (name, type, expense_kind, parent_id)
     values ('3단계', 'expense', 'consumption', '22222222-2222-4222-8222-222222222222')$q$,
  '23514', null, 'inserting a child under a child (depth 3) raises 23514');
select throws_ok(
  $q$update public.categories
       set parent_id = '33333333-3333-4333-8333-333333333333'
     where id = '11111111-1111-4111-8111-111111111111'$q$,
  '23514', null, 'demoting a parent that has children raises 23514');

-- ── 동작: create_budget + CF409 ─────────────────────────────
select lives_ok(
  $q$select public.create_budget(jsonb_build_object(
       'name', '3월', 'year', 2026, 'month', 3,
       'items', jsonb_build_array(
         jsonb_build_object('category_id', '11111111-1111-4111-8111-111111111111', 'planned_amount', 300000),
         jsonb_build_object('category_id', '22222222-2222-4222-8222-222222222222', 'planned_amount', 100000),
         jsonb_build_object('category_id', '44444444-4444-4444-8444-444444444444', 'planned_amount', 5000000))))$q$,
  'create_budget with items succeeds');
select throws_ok(
  $q$select public.create_budget(jsonb_build_object('name', '중복', 'year', 2026, 'month', 3))$q$,
  'CF409', null, 'duplicate year+month raises CF409');

-- ── 동작: budget_totals_v — 소분류 있는 대분류 제외 ──────────
select is(
  (select total_expense from public.budget_totals_v v
    join public.budgets b on b.id = v.budget_id
   where b.year = 2026 and b.month = 3),
  100000::bigint,
  'budget_totals_v excludes parent item when child items exist (식비 300000 제외, 외식 100000만)');
select is(
  (select total_income from public.budget_totals_v v
    join public.budgets b on b.id = v.budget_id
   where b.year = 2026 and b.month = 3),
  5000000::bigint,
  'budget_totals_v income total');

-- ── 동작: get_budget_actuals — applied만·저축 포함·가상 항목 ─
insert into public.transactions (type, amount, description, status, category_id, account_id, to_account_id, date) values
  ('expense', 40000, '외식', 'applied', '22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, '2026-03-05'),
  ('expense', 99999, '외식 pending', 'pending', '22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, '2026-03-06'),
  ('expense', 200000, '저축', 'applied', '33333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '2026-03-07'),
  ('transfer', 500000, '이체', 'applied', null, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '2026-03-08'),
  ('expense', 7000, '미분류 지출', 'applied', null, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, '2026-03-09');

-- 소분류(외식)에 자기 항목이 있으므로 실적 40000은 외식 항목에 붙는다
select is(
  (select (item->>'actualAmount')::bigint
     from jsonb_array_elements(public.get_budget_actuals(2026, 3)->'items') item
    where item->>'categoryId' = '22222222-2222-4222-8222-222222222222'),
  40000::bigint, 'child actual attaches to its own budget item');
-- 저축(예산 항목 없음) → planned 0 가상 항목
select is(
  (select (item->>'plannedAmount')::bigint
     from jsonb_array_elements(public.get_budget_actuals(2026, 3)->'items') item
    where item->>'categoryId' = '33333333-3333-4333-8333-333333333333'),
  0::bigint, 'saving actual without budget item becomes virtual item (planned 0)');
select is(
  (select (item->>'actualAmount')::bigint
     from jsonb_array_elements(public.get_budget_actuals(2026, 3)->'items') item
    where item->>'categoryId' = '33333333-3333-4333-8333-333333333333'),
  200000::bigint, 'saving transaction counts as expense actual');
-- 미분류(category_id NULL) 거래 — '미분류' 가상 항목으로 포함 (리뷰 HIGH1: 현행 유지, shape 고정)
select is(
  (select item->'categoryId'
     from jsonb_array_elements(public.get_budget_actuals(2026, 3)->'items') item
    where item->>'categoryName' = '미분류'),
  'null'::jsonb, 'uncategorized actual keeps categoryId null in output shape');
select is(
  (select (item->>'actualAmount')::bigint
     from jsonb_array_elements(public.get_budget_actuals(2026, 3)->'items') item
    where item->>'categoryName' = '미분류'),
  7000::bigint, 'uncategorized actual becomes virtual item (planned 0, 결산 합계와 일치)');
-- transfer/pending은 지출 실적 총계에서 제외, 미분류는 포함
select is(
  (public.get_budget_actuals(2026, 3)->'totals'->>'actualExpense')::bigint,
  247000::bigint, 'actualExpense = applied income/expense only (transfer/pending 제외, 미분류 포함)');

-- ── 동작: get_annual_grid — 그룹 롤업·부모 제외·월 배열 (리뷰 L10) ──
select is(
  jsonb_array_length(public.get_annual_grid(2026, 'expense', null)->'groups'),
  1, 'annual grid: expense filter yields 식비 group only');
select is(
  jsonb_array_length(public.get_annual_grid(2026, 'expense', null)->'groups'->0->'months'),
  12, 'annual grid: group months is a 12-element array');
-- 3월: 소분류(외식 100000) 항목이 있으므로 대분류(식비 300000)는 그룹 월합계에서 제외
select is(
  (public.get_annual_grid(2026, 'expense', null)->'groups'->0->'months'->>2)::bigint,
  100000::bigint, 'annual grid: month with child items sums children only (parent excluded)');
select is(
  (public.get_annual_grid(2026, null, null)->>'grandTotal')::bigint,
  5100000::bigint, 'annual grid grandTotal = 외식 100000 + 급여 5000000');
select is(
  (public.get_annual_grid(2026, null, 'saving')->>'grandTotal')::bigint,
  0::bigint, 'annual grid expense_kind filter (saving 항목 없음 → 0)');

-- ── 동작: update_budget CF404 / copy_budget CF404 ───────────
select throws_ok(
  $q$select public.update_budget('00000000-0000-4000-8000-000000000000', '{"name":"x"}'::jsonb)$q$,
  'CF404', null, 'update_budget on missing id raises CF404');
select throws_ok(
  $q$select public.copy_budget(2020, 1, 2020, 2)$q$,
  'CF404', null, 'copy_budget with missing source raises CF404');
select throws_ok(
  $q$select public.copy_budget(2026, 3, 2026, 3)$q$,
  'CF409', null, 'copy_budget onto existing target raises CF409');

-- ── 동작: upsert_budget_cell ────────────────────────────────
select lives_ok(
  $q$select public.upsert_budget_cell(2026, 9, '11111111-1111-4111-8111-111111111111', 120000)$q$,
  'upsert_budget_cell creates budget+item');
select is(
  (public.upsert_budget_cell(2026, 9, '11111111-1111-4111-8111-111111111111', 80000)->>'amount')::bigint,
  80000::bigint, 'upsert_budget_cell updates amount');
select is(
  public.upsert_budget_cell(2026, 9, '11111111-1111-4111-8111-111111111111', 0)->'itemId',
  'null'::jsonb, 'amount 0 deletes the item (itemId null)');

-- ── 동작: get_budget_summary ────────────────────────────────
select is(
  jsonb_array_length(public.get_budget_summary(2026)->'months'),
  12, 'get_budget_summary returns 12 months');

select * from finish();
rollback;
