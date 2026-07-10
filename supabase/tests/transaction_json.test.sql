-- pgTAP: Phase 1b — transaction_json(uuid) DTO 헬퍼 회귀 방지
-- 실행: supabase test db (migration 20260710130000_phase1b_transaction_json.sql)
begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

-- 함수 존재 + 시그니처
select has_function(
  'public'::name, 'transaction_json'::name, array['uuid'],
  'transaction_json(uuid) exists'
);
select function_returns(
  'public'::name, 'transaction_json'::name, array['uuid'], 'jsonb',
  'transaction_json returns jsonb'
);
-- 같은 문장 안 RPC 쓰기(태그 upsert)를 보려면 VOLATILE 필수
select volatility_is(
  'public'::name, 'transaction_json'::name, array['uuid'], 'volatile',
  'transaction_json is VOLATILE (same-statement snapshot)'
);

-- 동작: create_transaction과 같은 문장에서 태그 포함 DTO를 완성한다
with acc as (
  insert into public.accounts (name, type, initial_balance)
  values ('pgtap계좌', 'bank', 1000) returning id
), cat as (
  insert into public.categories (name, type, expense_kind)
  values ('pgtap식비', 'expense', 'consumption') returning id
)
select set_config('app.tap_account', (select id::text from acc), true) ||
       set_config('app.tap_category', (select id::text from cat), true);

select ok(
  (select public.transaction_json((public.create_transaction(jsonb_build_object(
     'type','expense','amount',500,'description','tap',
     'account_id', current_setting('app.tap_account'),
     'category_id', current_setting('app.tap_category'),
     'date','2026-07-10','tags', jsonb_build_array('tap태그')
   ))).id)->'tags'->0->>'name') = 'tap태그',
  'same-statement create returns tags in DTO'
);
select ok(
  (select public.transaction_json(t.id)->'category'->>'name' from public.transactions t
    where t.description = 'tap') = 'pgtap식비',
  'DTO joins category'
);

-- 미존재 id → NULL (호출부 404 처리 규약)
select ok(
  public.transaction_json('00000000-0000-4000-8000-000000000000'::uuid) is null,
  'unknown id returns NULL'
);

select * from finish();
rollback;
