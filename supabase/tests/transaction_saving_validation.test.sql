-- pgTAP: 저축 거래 정합성 검증 (DB-H1) — create/update 양 경로, 최종 상태 기준.
-- 규약: 저축 거래 = type='expense' + to_account_id NOT NULL + 카테고리 expense_kind='saving'(부모 롤업).
-- RAISE 규약: CF422 = 저축 정합성 위반, CF404 = 자원 없음 (api-errors.ts 매핑과 1:1).
-- 실행: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

-- ── 시드 ─────────────────────────────────────────────────────
insert into public.accounts (id, name, type) values
  ('00000000-0000-0000-0000-0000000000a1', '주계좌', 'bank'),
  ('00000000-0000-0000-0000-0000000000a2', '적금', 'savings');

insert into public.categories (id, name, type, expense_kind) values
  ('00000000-0000-0000-0000-0000000000c1', '저축', 'expense', 'saving'),
  ('00000000-0000-0000-0000-0000000000c2', '식비', 'expense', 'consumption');

insert into public.categories (id, name, type, expense_kind, parent_id) values
  ('00000000-0000-0000-0000-0000000000c3', '청년적금', 'expense', 'saving',
   '00000000-0000-0000-0000-0000000000c1');

-- ── create_transaction: 순방향 (saving 카테고리 → to_account 필수) ──
select throws_ok(
  $$select public.create_transaction(jsonb_build_object(
      'type','expense','amount',100,'description','적금','date','2026-07-01',
      'account_id','00000000-0000-0000-0000-0000000000a1',
      'category_id','00000000-0000-0000-0000-0000000000c1'))$$,
  'CF422', null, 'create: saving category without to_account_id → CF422');

select throws_ok(
  $$select public.create_transaction(jsonb_build_object(
      'type','expense','amount',100,'description','적금','date','2026-07-01',
      'account_id','00000000-0000-0000-0000-0000000000a1',
      'category_id','00000000-0000-0000-0000-0000000000c3'))$$,
  'CF422', null, 'create: saving subcategory (parent rollup) without to_account_id → CF422');

-- ── create_transaction: 역방향 (to_account 보유 → saving 카테고리 필수) ──
select throws_ok(
  $$select public.create_transaction(jsonb_build_object(
      'type','expense','amount',100,'description','잘못된 저축','date','2026-07-01',
      'account_id','00000000-0000-0000-0000-0000000000a1',
      'category_id','00000000-0000-0000-0000-0000000000c2',
      'to_account_id','00000000-0000-0000-0000-0000000000a2'))$$,
  'CF422', null, 'create: consumption category with to_account_id → CF422');

select throws_ok(
  $$select public.create_transaction(jsonb_build_object(
      'type','expense','amount',100,'description','카테고리 없음','date','2026-07-01',
      'account_id','00000000-0000-0000-0000-0000000000a1',
      'to_account_id','00000000-0000-0000-0000-0000000000a2'))$$,
  'CF422', null, 'create: expense with to_account_id but no category → CF422');

-- ── create_transaction: 정상 저축 거래 통과 ─────────────────
select lives_ok(
  $$select public.create_transaction(jsonb_build_object(
      'type','expense','amount',100,'description','정상 적금','date','2026-07-01',
      'account_id','00000000-0000-0000-0000-0000000000a1',
      'category_id','00000000-0000-0000-0000-0000000000c1',
      'to_account_id','00000000-0000-0000-0000-0000000000a2'))$$,
  'create: valid saving transaction passes');

select lives_ok(
  $$select public.create_transaction(jsonb_build_object(
      'type','expense','amount',100,'description','일반 지출','date','2026-07-01',
      'account_id','00000000-0000-0000-0000-0000000000a1',
      'category_id','00000000-0000-0000-0000-0000000000c2'))$$,
  'create: plain consumption expense passes');

-- ── update_transaction: 병합 후 최종 상태 기준 (부분 PATCH 조합 포함) ──
-- 고정 id의 저축 거래를 직접 INSERT (RPC 검증 대상 아님 — update 경로 검증용)
insert into public.transactions
  (id, type, amount, description, status, category_id, account_id, to_account_id, date)
values
  ('00000000-0000-0000-0000-0000000000d1', 'expense', 100, '적금', 'applied',
   '00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000a2', '2026-07-01');

select throws_ok(
  $$select public.update_transaction('00000000-0000-0000-0000-0000000000d1',
      jsonb_build_object('category_id','00000000-0000-0000-0000-0000000000c2'))$$,
  'CF422', null, 'update: switching saving tx to consumption category → CF422');

select throws_ok(
  $$select public.update_transaction('00000000-0000-0000-0000-0000000000d1',
      jsonb_build_object('to_account_id', null))$$,
  'CF422', null, 'update: removing to_account_id from saving tx → CF422');

select lives_ok(
  $$select public.update_transaction('00000000-0000-0000-0000-0000000000d1',
      jsonb_build_object('amount', 200))$$,
  'update: normal partial update on saving tx passes');

-- 일반 지출에 to_account_id만 추가하는 부분 PATCH 조합
insert into public.transactions
  (id, type, amount, description, status, category_id, account_id, date)
values
  ('00000000-0000-0000-0000-0000000000d2', 'expense', 100, '점심', 'applied',
   '00000000-0000-0000-0000-0000000000c2',
   '00000000-0000-0000-0000-0000000000a1', '2026-07-02');

select throws_ok(
  $$select public.update_transaction('00000000-0000-0000-0000-0000000000d2',
      jsonb_build_object('to_account_id','00000000-0000-0000-0000-0000000000a2'))$$,
  'CF422', null, 'update: adding to_account_id to consumption tx → CF422');

-- 예외 시 UPDATE 전체 롤백 — 원본 카테고리 유지 확인
select is(
  (select category_id from public.transactions
    where id = '00000000-0000-0000-0000-0000000000d1'),
  '00000000-0000-0000-0000-0000000000c1'::uuid,
  'update: failed validation leaves the row unchanged');

-- ── update_transaction: 자원 없음 → CF404 ───────────────────
select throws_ok(
  $$select public.update_transaction('99999999-9999-4999-8999-999999999999'::uuid,
      jsonb_build_object('amount', 1))$$,
  'CF404', null, 'update: missing transaction → CF404');

select * from finish();
rollback;
