-- pgTAP: Phase 2D 정기거래 — 스키마·제약·인덱스·RLS·함수·월말 보정·도래 처리 검증
-- 실행: supabase test db (docs/DB.md §1.7, §3.6, §3.7, §4, §5)
begin;

create extension if not exists pgtap with schema extensions;

select plan(58);

-- ── 테이블·컬럼 ─────────────────────────────────────────────
select has_table('public'::name, 'recurring_transactions'::name);
select col_type_is('public'::name,'recurring_transactions'::name,'amount'::name,'bigint');
select col_type_is('public'::name,'recurring_transactions'::name,'recur_interval'::name,'integer');
select col_type_is('public'::name,'recurring_transactions'::name,'next_date'::name,'date');
select col_default_is('public'::name,'recurring_transactions'::name,'recur_interval'::name,'1'::text,'recur_interval defaults to 1');
select col_default_is('public'::name,'recurring_transactions'::name,'is_active'::name,'true'::text,'is_active defaults to true');

-- ── CHECK 제약 ──────────────────────────────────────────────
select throws_ok(
  $$INSERT INTO public.recurring_transactions
      (type, amount, description, account_id, frequency, start_date, next_date)
    VALUES ('expense', 0, 'x', gen_random_uuid(), 'monthly', '2026-01-01', '2026-01-01')$$,
  '23514', null, 'amount > 0 CHECK');
select throws_ok(
  $$INSERT INTO public.recurring_transactions
      (type, amount, description, account_id, frequency, recur_interval, start_date, next_date)
    VALUES ('expense', 1, 'x', gen_random_uuid(), 'monthly', 0, '2026-01-01', '2026-01-01')$$,
  '23514', null, 'recur_interval >= 1 CHECK');
select throws_ok(
  $$INSERT INTO public.recurring_transactions
      (type, amount, description, account_id, frequency, start_date, end_date, next_date)
    VALUES ('expense', 1, 'x', gen_random_uuid(), 'weekly', '2026-02-01', '2026-01-01', '2026-02-01')$$,
  '23514', null, 'end_date >= start_date CHECK');

-- ── FK 후행 부착 (transactions.recurring_id) ────────────────
select ok(exists(select 1 from pg_constraint where conname = 'fk_tx_recurring_id'),
  'fk_tx_recurring_id exists');
select ok(
  (select confdeltype = 'n' from pg_constraint where conname = 'fk_tx_recurring_id'),
  'fk_tx_recurring_id is ON DELETE SET NULL');

-- ── 함수 시그니처 ────────────────────────────────────────────
select has_function('public','calc_next_date', array['date','text','integer']);
select has_function('public','recurring_json', array['uuid']);
select has_function('public','refill_recurring_pending', array['uuid','date']);
select has_function('public','create_recurring', array['jsonb']);
select has_function('public','update_recurring', array['uuid','jsonb']);
select has_function('public','delete_recurring', array['uuid']);
select has_function('public','process_due_transactions', array['date']);

-- calc_next_date는 IMMUTABLE (인덱스/제약에서 사용 가능해야 함)
select is(
  (select provolatile from pg_proc
    where proname = 'calc_next_date' and pronamespace = 'public'::regnamespace),
  'i', 'calc_next_date is IMMUTABLE');

-- recurring_json은 VOLATILE — create/update와 같은 문장에서 선행 쓰기가 보여야 함
select is(
  (select provolatile from pg_proc
    where proname = 'recurring_json' and pronamespace = 'public'::regnamespace),
  'v', 'recurring_json is VOLATILE (same-statement visibility)');

-- 전부 SECURITY INVOKER (DB.md §3: 투자 RPC 2종 외 전부 INVOKER)
select is(
  (select bool_or(prosecdef) from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in ('create_recurring','update_recurring','delete_recurring',
                      'process_due_transactions','refill_recurring_pending')),
  false, 'recurring RPCs are SECURITY INVOKER');

-- ── 인덱스 ──────────────────────────────────────────────────
select has_index('public'::name,'recurring_transactions'::name,'idx_recurring_due'::name);

-- ── RLS ────────────────────────────────────────────────────
select ok(
  (select relrowsecurity from pg_class
    where oid = 'public.recurring_transactions'::regclass),
  'recurring_transactions has RLS enabled');
select ok(exists(
  select 1 from pg_policies
  where schemaname = 'public' and tablename = 'recurring_transactions'
    and policyname = 'recurring_transactions_owner_all'),
  'owner_all policy exists');
select ok(not has_table_privilege('anon', 'public.recurring_transactions', 'SELECT'),
  'anon cannot SELECT recurring_transactions');
select ok(not has_function_privilege('anon', 'public.create_recurring(jsonb)', 'EXECUTE'),
  'anon cannot execute create_recurring');
select ok(has_function_privilege('authenticated', 'public.create_recurring(jsonb)', 'EXECUTE'),
  'authenticated can execute create_recurring');
select ok(not has_function_privilege('authenticated', 'public.refill_recurring_pending(uuid, date)', 'EXECUTE'),
  'authenticated cannot execute internal refill helper');

-- ── calc_next_date 월말/윤년 보정 케이스 테이블 (DB.md §3.6) ──
select is(public.calc_next_date('2026-01-31','monthly',1), '2026-02-28'::date, '1/31 +1m = 2/28 (평년)');
select is(public.calc_next_date('2024-01-31','monthly',1), '2024-02-29'::date, '1/31 +1m = 2/29 (윤년)');
select is(public.calc_next_date('2026-02-28','monthly',1), '2026-03-28'::date, '앵커=현재 일: 2/28 → 3/28');
select is(public.calc_next_date('2026-03-31','monthly',1), '2026-04-30'::date, '3/31 +1m = 4/30');
select is(public.calc_next_date('2026-05-31','monthly',1), '2026-06-30'::date, '5/31 +1m = 6/30');
select is(public.calc_next_date('2026-12-31','monthly',1), '2027-01-31'::date, '연 경계 12/31 +1m = 1/31');
select is(public.calc_next_date('2026-12-31','monthly',2), '2027-02-28'::date, '12/31 +2m = 2/28');
select is(public.calc_next_date('2026-01-15','monthly',2), '2026-03-15'::date, '중간 일 보존');
select is(public.calc_next_date('2024-02-29','yearly',1), '2025-02-28'::date, '윤년 2/29 +1y = 2/28');
select is(public.calc_next_date('2024-02-29','yearly',4), '2028-02-29'::date, '윤년 2/29 +4y = 2/29');
select is(public.calc_next_date('2026-01-01','daily',1), '2026-01-02'::date, 'daily +1');
select is(public.calc_next_date('2026-02-27','daily',3), '2026-03-02'::date, 'daily 평년 2월 경계');
select is(public.calc_next_date('2026-01-31','weekly',2), '2026-02-14'::date, 'weekly +2');
select throws_ok(
  $$select public.calc_next_date('2026-01-01','hourly',1)$$,
  '23514', null, '알 수 없는 frequency 거부');

-- ── 동작: create_recurring → pending 생성 → process_due ──────
-- 픽스처
insert into public.accounts (id, name, type, initial_balance)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'pgTAP은행', 'bank', 100000);
insert into public.categories (id, name, type, expense_kind)
values ('bbbbbbbb-0000-4000-8000-000000000001', 'pgTAP식비', 'expense', 'consumption');

-- 시작일 하한: 과거 무제한 입력은 전개 루프 폭주 → 23514 거부 (REV-H2)
select throws_ok(
  $$select public.create_recurring(jsonb_build_object(
      'type','expense','amount',1,'description','너무 오래된 규칙',
      'account_id','aaaaaaaa-0000-4000-8000-000000000001',
      'frequency','daily','start_date','0001-01-01'))$$,
  '23514', null, 'create_recurring rejects start_date before 1990-01-01');

-- 규칙 생성: 다음 달 1일 시작 월간 지출 → pending 12건 (오늘+12개월 지평 내)
select lives_ok(
  $$select public.create_recurring(jsonb_build_object(
      'type','expense','amount',10000,'description','pgTAP월세',
      'account_id','aaaaaaaa-0000-4000-8000-000000000001',
      'category_id','bbbbbbbb-0000-4000-8000-000000000001',
      'frequency','monthly','interval',1,
      'start_date', to_char((date_trunc('month', (now() at time zone 'Asia/Seoul')::date)
                             + interval '1 month')::date, 'YYYY-MM-DD')))$$,
  'create_recurring succeeds');

select is(
  (select count(*)::integer from public.transactions where status = 'pending'),
  12, 'creates 12 monthly pending transactions within 12-month horizon');

select is(
  (select count(distinct recurring_id)::integer from public.transactions),
  1, 'pending rows are linked to the rule');

-- next_date = 첫 발생일(다음 달 1일)
select is(
  (select next_date from public.recurring_transactions limit 1),
  (date_trunc('month', (now() at time zone 'Asia/Seoul')::date) + interval '1 month')::date,
  'next_date is the first occurrence');

-- 도래 처리: 규칙 next_date 당일로 process → 1건 applied + 재충전
select is(
  ((public.process_due_transactions(
      (date_trunc('month', (now() at time zone 'Asia/Seoul')::date) + interval '1 month')::date
    ))->>'applied')::integer,
  1, 'process_due applies the due pending transaction');

select is(
  (select count(*)::integer from public.transactions where status = 'applied'),
  1, 'one transaction became applied');

-- 잔액 반영: 100,000 − 10,000 = 90,000 (applied만 집계하는 잔액 뷰)
select is(
  (select current_balance from public.account_balances_v
    where account_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  90000::bigint, 'balance reflects the applied recurring expense');

-- 멱등성: 같은 날짜로 재실행 시 applied 0 + 신규 생성 0
select is(
  ((public.process_due_transactions(
      (date_trunc('month', (now() at time zone 'Asia/Seoul')::date) + interval '1 month')::date
    ))->>'applied')::integer,
  0, 'process_due is idempotent for the same day');

-- 수정 경로에서도 end_date >= start_date 불변식이 지켜진다 (테이블 CHECK, REV-M6)
select throws_ok(
  $$select public.update_recurring(
      (select id from public.recurring_transactions limit 1),
      jsonb_build_object('end_date', '1999-12-31'))$$,
  '23514', null, 'update_recurring rejects end_date before start_date');

-- 비활성 토글: update_recurring(is_active=false) → 미래 pending 정리
select lives_ok(
  $$select public.update_recurring(
      (select id from public.recurring_transactions limit 1),
      jsonb_build_object('is_active', false))$$,
  'deactivate via update_recurring');
select is(
  (select count(*)::integer from public.transactions where status = 'pending'),
  0, 'deactivation removes future pending');
select is(
  (select count(*)::integer from public.transactions where status = 'applied'),
  1, 'applied history preserved after deactivation');

-- 삭제: applied 이력 보존 + recurring_id NULL
select is(
  public.delete_recurring((select id from public.recurring_transactions limit 1)),
  true, 'delete_recurring returns true');
select is(
  (select count(*)::integer from public.recurring_transactions),
  0, 'rule removed');
select is(
  (select count(*)::integer from public.transactions
    where status = 'applied' and recurring_id is null),
  1, 'applied row kept with recurring_id nulled');

select * from finish();
rollback;
