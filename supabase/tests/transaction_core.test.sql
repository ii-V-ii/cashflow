-- pgTAP: Phase 1a 거래 코어 — 스키마·제약·인덱스·RLS·함수 시그니처 검증
-- 실행: supabase test db (docs/DB.md §1, §2.1, §3.1-3.3, §4, §5)
begin;

create extension if not exists pgtap with schema extensions;

select plan(57);

-- ── 테이블 존재 ──────────────────────────────────────────────
select has_table('public'::name, 'categories'::name);
select has_table('public'::name, 'accounts'::name);
select has_table('public'::name, 'tags'::name);
select has_table('public'::name, 'transactions'::name);
select has_table('public'::name, 'transaction_tags'::name);

-- ── 잔액 뷰 ─────────────────────────────────────────────────
select has_view('public'::name, 'account_balances_v'::name, 'account_balances_v exists');
select ok(
  (select reloptions::text ilike '%security_invoker=%on%'
     from pg_class where oid = 'public.account_balances_v'::regclass),
  'account_balances_v has security_invoker=on'
);

-- ── 컬럼 타입 (금액 bigint 규약) ─────────────────────────────
select col_type_is('public'::name,'transactions'::name,'amount'::name,'bigint');
select col_type_is('public'::name,'accounts'::name,'initial_balance'::name,'bigint');
select col_type_is('public'::name,'transactions'::name,'date'::name,'date');

-- ── CHECK 제약 ──────────────────────────────────────────────
select ok(exists(select 1 from pg_constraint where conname = 'chk_categories_expense_kind'),
  'chk_categories_expense_kind exists');
select ok(exists(select 1 from pg_constraint where conname = 'chk_tx_transfer_to_account'),
  'chk_tx_transfer_to_account exists');
select ok(exists(select 1 from pg_constraint where conname = 'chk_tx_income_no_to'),
  'chk_tx_income_no_to exists');
select ok(exists(select 1 from pg_constraint where conname = 'chk_tx_no_self_transfer'),
  'chk_tx_no_self_transfer exists');

-- ── RPC 함수 시그니처 ────────────────────────────────────────
select has_function('public','create_transaction', array['jsonb']);
select has_function('public','update_transaction', array['uuid','jsonb']);
select has_function('public','delete_transaction', array['uuid']);

-- SECURITY INVOKER 확인 (DB.md §3: 투자 RPC 2종 외 전부 INVOKER)
select is(
  (select prosecdef from pg_proc
    where proname = 'create_transaction' and pronamespace = 'public'::regnamespace),
  false, 'create_transaction is SECURITY INVOKER');
select is(
  (select prosecdef from pg_proc
    where proname = 'update_transaction' and pronamespace = 'public'::regnamespace),
  false, 'update_transaction is SECURITY INVOKER');
select is(
  (select prosecdef from pg_proc
    where proname = 'delete_transaction' and pronamespace = 'public'::regnamespace),
  false, 'delete_transaction is SECURITY INVOKER');

-- ── 인덱스 (DB.md §4) ────────────────────────────────────────
select has_index('public'::name,'categories'::name,'idx_categories_type'::name);
select has_index('public'::name,'categories'::name,'idx_categories_parent_id'::name);
select has_index('public'::name,'accounts'::name,'idx_accounts_type'::name);
select has_index('public'::name,'accounts'::name,'idx_accounts_asset_id'::name);
select has_index('public'::name,'accounts'::name,'idx_accounts_linked_account_id'::name);
select has_index('public'::name,'transactions'::name,'idx_tx_account_status'::name);
select has_index('public'::name,'transactions'::name,'idx_tx_to_account'::name);
select has_index('public'::name,'transactions'::name,'idx_tx_date_type_status'::name);
select has_index('public'::name,'transactions'::name,'idx_tx_category_id'::name);
select has_index('public'::name,'transactions'::name,'idx_tx_recurring_id'::name);
select has_index('public'::name,'transactions'::name,'idx_tx_pending_date'::name);
select has_index('public'::name,'transaction_tags'::name,'idx_transaction_tags_tag_id'::name);

-- tags.name UNIQUE (태그 upsert의 전제)
select index_is_unique('public'::name,'tags'::name,'tags_name_key'::name);

-- ── RLS (DB.md §5) ──────────────────────────────────────────
select ok((select relrowsecurity from pg_class where oid = 'public.categories'::regclass),
  'RLS enabled on categories');
select ok((select relrowsecurity from pg_class where oid = 'public.accounts'::regclass),
  'RLS enabled on accounts');
select ok((select relrowsecurity from pg_class where oid = 'public.tags'::regclass),
  'RLS enabled on tags');
select ok((select relrowsecurity from pg_class where oid = 'public.transactions'::regclass),
  'RLS enabled on transactions');
select ok((select relrowsecurity from pg_class where oid = 'public.transaction_tags'::regclass),
  'RLS enabled on transaction_tags');

select policies_are('public','categories', array['categories_owner_all']);
select policies_are('public','accounts', array['accounts_owner_all']);
select policies_are('public','tags', array['tags_owner_all']);
select policies_are('public','transactions', array['transactions_owner_all']);
select policies_are('public','transaction_tags', array['transaction_tags_owner_all']);

-- 정책 본문이 실제로 소유자 이메일을 검증하는지 (USING (true) 회귀 방지)
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public'
      and policyname in ('categories_owner_all','accounts_owner_all','tags_owner_all',
                         'transactions_owner_all','transaction_tags_owner_all')
      and qual like '%app.owner_email%'
      and with_check like '%app.owner_email%'),
  5, 'owner policies verify app.owner_email in USING and WITH CHECK');

-- 권한: anon은 함수 실행 불가(전역 REVOKE), authenticated는 RPC만 실행 가능
select ok(not has_function_privilege('anon', 'public.set_updated_at()', 'EXECUTE'),
  'anon cannot execute set_updated_at');
select ok(not has_function_privilege('anon', 'public.create_transaction(jsonb)', 'EXECUTE'),
  'anon cannot execute create_transaction');
select ok(has_function_privilege('authenticated', 'public.create_transaction(jsonb)', 'EXECUTE'),
  'authenticated can execute create_transaction');

-- ── updated_at 트리거 ────────────────────────────────────────
select has_trigger('public'::name,'categories'::name,'trg_categories_updated_at'::name);
select has_trigger('public'::name,'accounts'::name,'trg_accounts_updated_at'::name);
select has_trigger('public'::name,'transactions'::name,'trg_transactions_updated_at'::name);

-- ── 제약 위반 동작 검증 ──────────────────────────────────────
insert into public.accounts (id, name, type) values
  ('00000000-0000-0000-0000-00000000000a', '테스트A', 'bank'),
  ('00000000-0000-0000-0000-00000000000b', '테스트B', 'bank');

select throws_ok(
  $$insert into public.transactions (type, amount, description, date, account_id)
    values ('expense', 0, 'x', '2026-07-01', '00000000-0000-0000-0000-00000000000a')$$,
  '23514', null, 'amount must be > 0');

select throws_ok(
  $$insert into public.transactions (type, amount, description, date, account_id)
    values ('transfer', 100, 'x', '2026-07-01', '00000000-0000-0000-0000-00000000000a')$$,
  '23514', null, 'transfer requires to_account_id');

select throws_ok(
  $$insert into public.transactions (type, amount, description, date, account_id, to_account_id)
    values ('income', 100, 'x', '2026-07-01',
            '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b')$$,
  '23514', null, 'income must not have to_account_id');

select throws_ok(
  $$insert into public.transactions (type, amount, description, date, account_id, to_account_id)
    values ('transfer', 100, 'x', '2026-07-01',
            '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a')$$,
  '23514', null, 'self transfer is rejected');

select throws_ok(
  $$insert into public.categories (name, type) values ('식비', 'expense')$$,
  '23514', null, 'expense category requires expense_kind');

select throws_ok(
  $$insert into public.categories (name, type, expense_kind) values ('급여', 'income', 'saving')$$,
  '23514', null, 'income category must not have expense_kind');

-- 저축 거래 규칙: CHECK로 표현 불가 → RPC 검증 (DB.md §1.3 주석의 pgTAP 보증)
insert into public.categories (id, name, type, expense_kind)
  values ('00000000-0000-0000-0000-0000000000c1', '저축', 'expense', 'saving');

select throws_ok(
  $$select public.create_transaction(jsonb_build_object(
      'type','expense','amount',100,'description','적금','date','2026-07-01',
      'account_id','00000000-0000-0000-0000-00000000000a',
      'category_id','00000000-0000-0000-0000-0000000000c1'))$$,
  'CF422', null, 'saving-category expense without to_account_id is rejected by RPC');

select * from finish();
rollback;
