-- pgTAP: Phase 2B 결산·대시보드 RPC — 시그니처·권한·도메인 규칙 검증
-- 실행: supabase test db (docs/DB.md §3.9-3.10, docs/API.md §7·§8)
-- 도메인 규칙: 저축 포함 / applied만 / 대분류 롤업 / 전월 비교 / 캘린더 pending 제외
--
-- 실행 시각 독립성(HIGH-B 리뷰 반영, 20260721000010): get_dashboard.recent_transactions가
-- date <= (now() AT TIME ZONE 'Asia/Seoul')::date 로 필터링되므로, 시드 날짜가 실행
-- 시점의 실제 "오늘"보다 미래면 해당 행이 배제되어 "capped at 5" 어서션이 깨진다.
-- 이 파일의 모든 시드/함수 호출 연도를 2020으로 고정해 실행 시점과 무관하게 항상
-- 과거가 되도록 한다 — tests/integration/api-v1-dashboard.test.ts의 "KST 오늘" 동적
-- 조회 패턴 대신, 이 파일은 get_monthly_settlement/get_annual_settlement 등 수십 개
-- 어서션이 동일 연도(2026)에 강하게 결합돼 있어 전체를 동적 날짜로 재작성하는 대신
-- 안전하게 과거인 고정 연도로 이동하는 쪽이 최소 위험(minimal-risk) 수정이다.
begin;

create extension if not exists pgtap with schema extensions;

select plan(47);

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
   '00000000-0000-4000-8000-000000000001', null, '2020-06-05'),
  ('expense',  50000, '전월식비', 'applied', '00000000-0000-4000-8000-000000000102',
   '00000000-0000-4000-8000-000000000001', null, '2020-06-10'),
  -- 7월 (당월): 수입 500,000
  ('income',  500000, '급여', 'applied', '00000000-0000-4000-8000-000000000101',
   '00000000-0000-4000-8000-000000000001', null, '2020-07-01'),
  -- 7월 지출: 식비(대분류) 30,000 + 외식(소분류→식비 롤업) 20,000
  ('expense',  30000, '장보기', 'applied', '00000000-0000-4000-8000-000000000102',
   '00000000-0000-4000-8000-000000000001', null, '2020-07-03'),
  ('expense',  20000, '외식', 'applied', '00000000-0000-4000-8000-000000000104',
   '00000000-0000-4000-8000-000000000001', null, '2020-07-05'),
  -- 7월 저축 거래: expense + saving 카테고리 + 입금 계좌 → 지출 총계 포함
  ('expense', 100000, '적금이체', 'applied', '00000000-0000-4000-8000-000000000103',
   '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '2020-07-10'),
  -- 7월 pending: 결산·캘린더에서 제외되어야 함
  ('expense', 999999, '예정지출', 'pending', '00000000-0000-4000-8000-000000000102',
   '00000000-0000-4000-8000-000000000001', null, '2020-07-20');

-- ── get_monthly_settlement 도메인 규칙 ───────────────────────
select is(
  (public.get_monthly_settlement(2020, 7)->>'total_income')::bigint, 500000::bigint,
  'monthly: total_income = 500,000');
-- 저축 100,000 포함 + pending 999,999 제외 → 30,000+20,000+100,000
select is(
  (public.get_monthly_settlement(2020, 7)->>'total_expense')::bigint, 150000::bigint,
  'monthly: total_expense includes saving, excludes pending');
select is(
  (public.get_monthly_settlement(2020, 7)->>'net_income')::bigint, 350000::bigint,
  'monthly: net_income = income - expense');

-- 대분류 롤업: 외식(소분류)이 식비로 합산 → expense_by_category 는 식비 50,000 + 저축 100,000 = 2행
select is(
  jsonb_array_length(public.get_monthly_settlement(2020, 7)->'expense_by_category'), 2,
  'monthly: child category rolls up to parent (2 expense rows)');
select is(
  (select elem->>'amount' from jsonb_array_elements(
     public.get_monthly_settlement(2020, 7)->'expense_by_category') elem
    where elem->>'category_name' = '식비'), '50000',
  'monthly: 식비 rollup = 30,000 + 20,000(외식)');
select is(
  (select elem->>'expense_kind' from jsonb_array_elements(
     public.get_monthly_settlement(2020, 7)->'expense_by_category') elem
    where elem->>'category_name' = '저축'), 'saving',
  'monthly: expense_by_category exposes expense_kind for saving split');

-- 전월 비교
select is(
  (public.get_monthly_settlement(2020, 7)->'previous_month'->>'income')::bigint, 300000::bigint,
  'monthly: previous_month.income = 300,000');
select is(
  (public.get_monthly_settlement(2020, 7)->'previous_month'->>'expense')::bigint, 50000::bigint,
  'monthly: previous_month.expense = 50,000');

-- 계좌별 기초/기말: 은행 기초 = 100,000(초기) + 전월(300,000 - 50,000) = 350,000
select is(
  (select elem->>'opening_balance' from jsonb_array_elements(
     public.get_monthly_settlement(2020, 7)->'account_changes') elem
    where elem->>'name' = '은행'), '350000',
  'monthly: bank opening = initial + pre-month effects');
-- 은행 기말 = 350,000 + 500,000 - (30,000+20,000+100,000) = 700,000
select is(
  (select elem->>'closing_balance' from jsonb_array_elements(
     public.get_monthly_settlement(2020, 7)->'account_changes') elem
    where elem->>'name' = '은행'), '700000',
  'monthly: bank closing = opening + in - out');
-- 적금 기말 = 0 + 저축 입금 100,000 (저축 거래의 to_account 입금 반영)
select is(
  (select elem->>'closing_balance' from jsonb_array_elements(
     public.get_monthly_settlement(2020, 7)->'account_changes') elem
    where elem->>'name' = '적금'), '100000',
  'monthly: savings account receives saving deposit');

-- ── get_annual_settlement ────────────────────────────────────
select is(
  (select elem->>'income' from jsonb_array_elements(
     public.get_annual_settlement(2020)->'months') elem
    where (elem->>'month')::int = 7), '500000',
  'annual: July income = 500,000');
select is(
  (select elem->>'saving' from jsonb_array_elements(
     public.get_annual_settlement(2020)->'months') elem
    where (elem->>'month')::int = 7), '100000',
  'annual: July saving = 100,000 (saving-kind rollup)');
-- 연간 카테고리 롤업: 식비 = 50,000(6월) + 50,000(7월)
select is(
  (select elem->>'amount' from jsonb_array_elements(
     public.get_annual_settlement(2020)->'by_category') elem
    where elem->>'category_name' = '식비'), '100000',
  'annual: 식비 yearly rollup across months');

-- ── get_dashboard ────────────────────────────────────────────
select is(
  (public.get_dashboard(2020, 7)->>'month_income')::bigint, 500000::bigint,
  'dashboard: month_income = 500,000');
select is(
  (public.get_dashboard(2020, 7)->>'month_expense')::bigint, 150000::bigint,
  'dashboard: month_expense includes saving, excludes pending');
-- 총잔액: 은행 700,000 + 적금 100,000 (pending 999,999 미반영)
select is(
  (public.get_dashboard(2020, 7)->>'total_balance')::bigint, 800000::bigint,
  'dashboard: total_balance from account_balances_v (applied only)');
-- 캘린더: applied 거래 일자 4일만 (pending 07-20 제외)
select is(
  jsonb_array_length(public.get_dashboard(2020, 7)->'calendar'), 4,
  'dashboard: calendar has applied-only days (pending excluded)');
select ok(
  not exists (
    select 1 from jsonb_array_elements(public.get_dashboard(2020, 7)->'calendar') elem
    where elem->>'date' = '2020-07-20'),
  'dashboard: pending date absent from calendar');
-- 빈 상태(자산 없음·해당 월 예산 없음) → null (UI 빈 상태 표시)
select is(public.get_dashboard(2020, 7)->'investment', 'null'::jsonb,
  'dashboard: investment is null when no assets exist');
select is(public.get_dashboard(2020, 7)->'budget_usage', 'null'::jsonb,
  'dashboard: budget_usage is null when no budget for the month');
-- 최근 거래 5건 제한 (7월 시드 5건 모두 v_start~v_end·오늘 이하 조건을 통과 — 6월 2건은
-- 월 경계로 이미 배제). 2020년 고정 시드라 (now())::date 기준 오늘 이하 조건은
-- 실행 시점과 무관하게 항상 참이다 (파일 상단 주석 참조).
select is(
  jsonb_array_length(public.get_dashboard(2020, 7)->'recent_transactions'), 5,
  'dashboard: recent_transactions capped at 5');

-- ══ Phase 2 통합 — category_rollup_v + get_dashboard 확장 ══════

-- ── category_rollup_v: 대분류 롤업 공용 뷰 ───────────────────
select has_view('public', 'category_rollup_v', 'category_rollup_v exists');
-- 외식(소분류) 20,000 이 식비(대분류)로 롤업되어 7월 식비 = 50,000 (applied만)
select is(
  (select sum(amount)::bigint from public.category_rollup_v
    where category_name = '식비' and status = 'applied'
      and date >= '2020-07-01' and date < '2020-08-01'), 50000::bigint,
  'category_rollup_v: child rolls up to parent, applied filterable');

-- ── 통합 시드: 예산(2020-07) + 자산·매매 ─────────────────────
insert into public.budgets (id, name, year, month) values
  ('00000000-0000-4000-8000-000000000201', '2020년 7월 예산', 2020, 7);
insert into public.budget_items (budget_id, category_id, planned_amount) values
  -- 식비 200,000 + 저축 100,000 → budget_totals_v.total_expense = 300,000
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000102', 200000),
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000103', 100000);

insert into public.asset_categories (id, name, kind) values
  ('00000000-0000-4000-8000-000000000301', '금융자산', 'financial');
insert into public.assets (id, name, asset_category_id, acquisition_date, acquisition_cost) values
  -- 펀드: 연동 계좌·로트 없음 → 최신 평가액 1,200,000
  ('00000000-0000-4000-8000-000000000302', '펀드',
   '00000000-0000-4000-8000-000000000301', '2020-01-01', 1000000),
  -- 연금: 계좌 연동 → 계좌 잔액 500,000 이 자산 가치
  ('00000000-0000-4000-8000-000000000303', '연금',
   '00000000-0000-4000-8000-000000000301', '2020-01-01', 400000);
insert into public.asset_valuations (asset_id, date, value) values
  ('00000000-0000-4000-8000-000000000302', '2020-07-01', 1200000);
insert into public.accounts (id, name, type, initial_balance, sort_order, asset_id) values
  ('00000000-0000-4000-8000-000000000003', '연금계좌', 'investment', 500000, 2,
   '00000000-0000-4000-8000-000000000303');
insert into public.investment_trades
  (asset_id, trade_type, date, quantity, unit_price, total_amount, fee, tax,
   net_amount, realized_gain) values
  -- 7월: 매수 500,000 / 매도 net 297,000(실현손익 47,000) / 배당 10,000
  ('00000000-0000-4000-8000-000000000302', 'buy',      '2020-07-02', 10, 50000, 500000, 0, 0, 500000, 0),
  ('00000000-0000-4000-8000-000000000302', 'sell',     '2020-07-15',  5, 60000, 300000, 3000, 0, 297000, 47000),
  ('00000000-0000-4000-8000-000000000302', 'dividend', '2020-07-20',  1, 10000,  10000, 0, 0,  10000, 0);

-- ── budget_usage: 지출 계획 대비 실적 소진율 ─────────────────
select is(
  (public.get_dashboard(2020, 7)->'budget_usage'->>'plannedTotal')::bigint, 300000::bigint,
  'dashboard: budget_usage.plannedTotal = budget_totals_v.total_expense');
select is(
  (public.get_dashboard(2020, 7)->'budget_usage'->>'actualTotal')::bigint, 150000::bigint,
  'dashboard: budget_usage.actualTotal = applied month expense (saving included)');
select is(
  (public.get_dashboard(2020, 7)->'budget_usage'->>'ratio')::numeric, 50.0::numeric,
  'dashboard: budget_usage.ratio = actual / planned * 100');

-- ── investment: 해당 월 매매 요약 + 보유 평가 ────────────────
select is(
  (public.get_dashboard(2020, 7)->'investment'->>'invested')::bigint, 500000::bigint,
  'dashboard: investment.invested = month buy total');
select is(
  (public.get_dashboard(2020, 7)->'investment'->>'sold')::bigint, 297000::bigint,
  'dashboard: investment.sold = month sell net');
select is(
  (public.get_dashboard(2020, 7)->'investment'->>'dividend')::bigint, 10000::bigint,
  'dashboard: investment.dividend = month dividend net');
select is(
  (public.get_dashboard(2020, 7)->'investment'->>'realizedGain')::bigint, 47000::bigint,
  'dashboard: investment.realizedGain = month realized gain');
-- totalValue = 펀드 1,200,000(최신 평가) + 연금 500,000(연동 계좌)
select is(
  (public.get_dashboard(2020, 7)->'investment'->>'totalValue')::bigint, 1700000::bigint,
  'dashboard: investment.totalValue = sum of active asset values');

-- ── net_worth: 자산 합계 + 자산 미연동 계좌 잔액 (이중 계상 방지) ──
-- 은행 700,000 + 적금 100,000 (미연동) + 자산 1,700,000 = 2,500,000
select is(
  (public.get_dashboard(2020, 7)->>'net_worth')::bigint, 2500000::bigint,
  'dashboard: net_worth = unlinked account balances + asset values');
-- total_balance 는 연동 계좌 포함 전체 활성 계좌: 800,000 + 500,000
select is(
  (public.get_dashboard(2020, 7)->>'total_balance')::bigint, 1300000::bigint,
  'dashboard: total_balance still includes asset-linked accounts');

-- ── 에지: 지출 계획 0 → ratio null (get_budget_actuals 규약) ──
-- 예산 항목을 전부 삭제해 계획 0 으로 만든다 (예산 행은 존재 → budget_usage 는 non-null)
delete from public.budget_items
 where budget_id = '00000000-0000-4000-8000-000000000201';
select is(
  public.get_dashboard(2020, 7)->'budget_usage'->'ratio', 'null'::jsonb,
  'dashboard: budget_usage.ratio is null when planned total is 0');
select is(
  (public.get_dashboard(2020, 7)->'budget_usage'->>'actualTotal')::bigint, 150000::bigint,
  'dashboard: budget_usage.actualTotal remains real spending when planned is 0');

-- ── 에지: 전부 비활성 자산 → investment null (활성 기준 일치) ──
update public.assets set is_active = false;
select is(
  public.get_dashboard(2020, 7)->'investment', 'null'::jsonb,
  'dashboard: investment is null when all assets are inactive');

select * from finish();
rollback;
