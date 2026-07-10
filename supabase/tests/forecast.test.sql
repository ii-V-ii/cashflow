-- pgTAP: Phase 2E 예측 — 스키마·제약·인덱스·RLS 검증
-- 실행: supabase test db (docs/DB.md §1.8, §4, §5)
begin;

create extension if not exists pgtap with schema extensions;

select plan(25);

-- ── 테이블 존재 ──────────────────────────────────────────────
select has_table('public'::name, 'forecast_scenarios'::name);
select has_table('public'::name, 'forecast_results'::name);

-- ── 컬럼 타입 (금액 bigint 규약, 기간 date) ──────────────────
select col_type_is('public'::name,'forecast_scenarios'::name,'assumptions'::name,'jsonb');
select col_type_is('public'::name,'forecast_scenarios'::name,'start_date'::name,'date');
select col_type_is('public'::name,'forecast_scenarios'::name,'end_date'::name,'date');
select col_type_is('public'::name,'forecast_results'::name,'projected_income'::name,'bigint');
select col_type_is('public'::name,'forecast_results'::name,'projected_expense'::name,'bigint');
select col_type_is('public'::name,'forecast_results'::name,'projected_balance'::name,'bigint');
select col_type_is('public'::name,'forecast_results'::name,'projected_net_worth'::name,'bigint');
select col_type_is('public'::name,'forecast_results'::name,'details'::name,'jsonb');

-- ── 제약 ────────────────────────────────────────────────────
select ok(
  exists(select 1 from pg_constraint
    where conrelid = 'public.forecast_scenarios'::regclass
      and contype = 'c' and pg_get_constraintdef(oid) ilike '%end_date > start_date%'),
  'forecast_scenarios CHECK (end_date > start_date) exists');
select ok(
  exists(select 1 from pg_constraint
    where conname = 'uq_forecast_results_scenario_date'),
  'uq_forecast_results_scenario_date exists');

-- CHECK 위반: end_date <= start_date
select throws_ok(
  $$ INSERT INTO public.forecast_scenarios (name, start_date, end_date)
     VALUES ('bad', '2026-05-01', '2026-05-01') $$,
  '23514', null, 'end_date = start_date rejected');

-- UNIQUE 위반: 동일 scenario_id + date
select lives_ok(
  $$ INSERT INTO public.forecast_scenarios (id, name, start_date, end_date)
     VALUES ('9e0a2c4c-0000-4000-8000-000000000001', 's', '2026-01-01', '2026-03-01') $$,
  'scenario insert ok');
select lives_ok(
  $$ INSERT INTO public.forecast_results
       (scenario_id, date, projected_income, projected_expense,
        projected_balance, projected_net_worth)
     VALUES ('9e0a2c4c-0000-4000-8000-000000000001', '2026-01-01', 0, 0, 0, 0) $$,
  'result insert ok');
select throws_ok(
  $$ INSERT INTO public.forecast_results
       (scenario_id, date, projected_income, projected_expense,
        projected_balance, projected_net_worth)
     VALUES ('9e0a2c4c-0000-4000-8000-000000000001', '2026-01-01', 1, 1, 1, 1) $$,
  '23505', null, 'duplicate (scenario_id, date) rejected');

-- 시나리오 삭제 시 결과 CASCADE
select lives_ok(
  $$ DELETE FROM public.forecast_scenarios
     WHERE id = '9e0a2c4c-0000-4000-8000-000000000001' $$,
  'scenario delete ok');
select is(
  (select count(*)::int from public.forecast_results
    where scenario_id = '9e0a2c4c-0000-4000-8000-000000000001'),
  0, 'results cascade-deleted with scenario');

-- ── updated_at 트리거 ───────────────────────────────────────
select has_trigger('public'::name, 'forecast_scenarios'::name,
  'trg_forecast_scenarios_updated_at'::name);
select has_trigger('public'::name, 'forecast_results'::name,
  'trg_forecast_results_updated_at'::name);

-- ── 인덱스 (DB.md §4) ────────────────────────────────────────
select has_index('public'::name,'forecast_results'::name,
  'idx_forecast_results_scenario_id'::name);

-- ── RLS (DB.md §5 — phase1과 동일한 소유자 정책) ─────────────
select ok(
  (select relrowsecurity from pg_class where oid = 'public.forecast_scenarios'::regclass),
  'forecast_scenarios RLS enabled');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.forecast_results'::regclass),
  'forecast_results RLS enabled');
select policies_are('public'::name, 'forecast_scenarios'::name,
  array['forecast_scenarios_owner_all']);
select policies_are('public'::name, 'forecast_results'::name,
  array['forecast_results_owner_all']);

select * from finish();
rollback;
