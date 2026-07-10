-- pgTAP: Phase 2C 자산·투자 — 스키마·제약·인덱스·뷰·RPC·RLS 검증
-- 실행: supabase test db (docs/DB.md §1.6, §1.9, §2.1-2.3, §2.5, §3.4-3.5, §3.8, §3.13, §4, §5)
begin;

create extension if not exists pgtap with schema extensions;

select plan(48);

-- ── 테이블 존재 ──────────────────────────────────────────────
select has_table('public'::name, 'asset_categories'::name);
select has_table('public'::name, 'assets'::name);
select has_table('public'::name, 'asset_valuations'::name);
select has_table('public'::name, 'investment_trades'::name);

-- ── 컬럼 타입 (금액 bigint / 수량 numeric(20,8) 규약) ────────
select col_type_is('public'::name,'assets'::name,'acquisition_cost'::name,'bigint');
select col_type_is('public'::name,'asset_valuations'::name,'value'::name,'bigint');
select col_type_is('public'::name,'investment_trades'::name,'quantity'::name,'numeric(20,8)');
select col_type_is('public'::name,'investment_trades'::name,'remaining_quantity'::name,'numeric(20,8)');
select col_type_is('public'::name,'investment_trades'::name,'unit_price'::name,'bigint');
select col_type_is('public'::name,'investment_trades'::name,'realized_gain'::name,'bigint');

-- ── CHECK 제약 (FIFO 파생 컬럼 방어) ─────────────────────────
select ok(exists(select 1 from pg_constraint where conname = 'chk_trades_remaining_le_qty'),
  'chk_trades_remaining_le_qty exists');
select ok(exists(select 1 from pg_constraint where conname = 'chk_trades_gain_sell_only'),
  'chk_trades_gain_sell_only exists');
select ok(exists(select 1 from pg_constraint where conname = 'chk_trades_remaining_buy_only'),
  'chk_trades_remaining_buy_only exists');

-- ── FK: accounts.asset_id 후행 부착 (Phase 1a 주석 약속 이행) ─
select ok(exists(select 1 from pg_constraint where conname = 'fk_accounts_asset_id'),
  'fk_accounts_asset_id attached to accounts');

-- ── UNIQUE: 평가 이력 (asset_id, date) ───────────────────────
select ok(exists(select 1 from pg_constraint where conname = 'uq_asset_valuations_asset_date'),
  'uq_asset_valuations_asset_date exists');

-- ── 뷰 존재 + security_invoker ───────────────────────────────
select has_view('public'::name, 'open_lots_v'::name, 'open_lots_v exists');
select has_view('public'::name, 'asset_values_v'::name, 'asset_values_v exists');
select has_view('public'::name, 'monthly_investment_summary_v'::name,
  'monthly_investment_summary_v exists');
select ok(
  (select reloptions::text ilike '%security_invoker=%on%'
     from pg_class where oid = 'public.open_lots_v'::regclass),
  'open_lots_v has security_invoker=on');
select ok(
  (select reloptions::text ilike '%security_invoker=%on%'
     from pg_class where oid = 'public.asset_values_v'::regclass),
  'asset_values_v has security_invoker=on');
select ok(
  (select reloptions::text ilike '%security_invoker=%on%'
     from pg_class where oid = 'public.monthly_investment_summary_v'::regclass),
  'monthly_investment_summary_v has security_invoker=on');
select ok(
  (select reloptions::text ilike '%security_invoker=%on%'
     from pg_class where oid = 'public.account_balances_v'::regclass),
  'account_balances_v (replaced) keeps security_invoker=on');

-- ── account_balances_v: 투자 분기 활성화 확인 ────────────────
select ok(
  (select pg_get_viewdef('public.account_balances_v'::regclass) ilike '%investment_trades%'),
  'account_balances_v aggregates investment_trades');

-- ── RPC 함수 시그니처 ────────────────────────────────────────
select has_function('public','create_investment_trade', array['jsonb']);
select has_function('public','delete_investment_trade', array['uuid']);
select has_function('public','get_investment_summary', array['text','integer','integer']);
select has_function('public','snapshot_asset_valuations', array['date']);

-- SECURITY DEFINER는 FIFO 2함수만, 나머지는 INVOKER (DB.md §5 확정)
select is(
  (select prosecdef from pg_proc
    where proname = 'create_investment_trade' and pronamespace = 'public'::regnamespace),
  true, 'create_investment_trade is SECURITY DEFINER');
select is(
  (select prosecdef from pg_proc
    where proname = 'delete_investment_trade' and pronamespace = 'public'::regnamespace),
  true, 'delete_investment_trade is SECURITY DEFINER');
select is(
  (select prosecdef from pg_proc
    where proname = 'get_investment_summary' and pronamespace = 'public'::regnamespace),
  false, 'get_investment_summary is SECURITY INVOKER');
select is(
  (select prosecdef from pg_proc
    where proname = 'snapshot_asset_valuations' and pronamespace = 'public'::regnamespace),
  false, 'snapshot_asset_valuations is SECURITY INVOKER');

-- SECURITY DEFINER 2함수는 search_path=public 고정 (스키마 하이재킹 방지)
select ok(
  (select proconfig::text like '%search_path=public%' from pg_proc
    where proname = 'create_investment_trade' and pronamespace = 'public'::regnamespace),
  'create_investment_trade sets search_path=public');
select ok(
  (select proconfig::text like '%search_path=public%' from pg_proc
    where proname = 'delete_investment_trade' and pronamespace = 'public'::regnamespace),
  'delete_investment_trade sets search_path=public');

-- ── 인덱스 (DB.md §4) ────────────────────────────────────────
select has_index('public'::name,'assets'::name,'idx_assets_asset_category_id'::name);
select has_index('public'::name,'assets'::name,'idx_assets_is_active'::name);
select has_index('public'::name,'asset_valuations'::name,'idx_asset_valuations_asset_date'::name);
select has_index('public'::name,'asset_valuations'::name,'idx_asset_valuations_date'::name);
select has_index('public'::name,'investment_trades'::name,'idx_trades_asset_date'::name);
select has_index('public'::name,'investment_trades'::name,'idx_trades_account_id'::name);
select has_index('public'::name,'investment_trades'::name,'idx_trades_date'::name);
select has_index('public'::name,'investment_trades'::name,'idx_trades_open_lots'::name);
select has_index('public'::name,'investment_trades'::name,'idx_trades_consumed_lots'::name);

-- ── RLS (DB.md §5) ───────────────────────────────────────────
select ok((select relrowsecurity from pg_class where oid = 'public.asset_categories'::regclass),
  'asset_categories RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.assets'::regclass),
  'assets RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.asset_valuations'::regclass),
  'asset_valuations RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.investment_trades'::regclass),
  'investment_trades RLS enabled');

-- FIFO 파생 컬럼 이중 방어: authenticated의 컬럼 UPDATE 권한 제거
select is(
  (select has_column_privilege('authenticated', 'public.investment_trades',
     'remaining_quantity', 'UPDATE')),
  false, 'authenticated cannot UPDATE remaining_quantity');
select is(
  (select has_column_privilege('authenticated', 'public.investment_trades',
     'realized_gain', 'UPDATE')),
  false, 'authenticated cannot UPDATE realized_gain');

select * from finish();
rollback;
