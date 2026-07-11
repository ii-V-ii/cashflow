-- 10_cutover_move_to_legacy.sql — 컷오버: 구 public 객체를 legacy 스키마로 in-place 이동
--
-- 원격(호스팅 Supabase)에서는 ALTER SCHEMA public RENAME 이 불가(소유권·확장 의존)하므로
-- ALTER TABLE ... SET SCHEMA 개별 이동을 사용한다. FK·인덱스·제약은 테이블과 함께 이동된다.
--
-- 멱등/가드:
--   - 신 스키마(uuid PK transactions)가 이미 public 에 있으면 아무것도 하지 않는다.
--   - 각 테이블은 public 에 존재할 때만 이동.
--   - supabase_realtime publication 에 물려 있으면 방어적으로 제거 후 이동.
\set ON_ERROR_STOP on

BEGIN;

CREATE SCHEMA IF NOT EXISTS legacy;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'transaction_tags',        -- FK 자식부터 (순서는 SET SCHEMA 에 영향 없지만 가독성용)
    'transactions',
    'budget_items',
    'budgets',
    'recurring_transactions',
    'investment_trades',
    'investment_returns',
    'asset_valuations',
    'accounts',
    'assets',
    'asset_categories',
    'categories',
    'tags',
    'forecast_results',
    'forecast_scenarios'
  ];
BEGIN
  -- 가드: 신 스키마가 이미 적용된 상태에서 재실행하면 신 테이블을 옮겨버릴 수 있으므로 차단
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transactions'
      AND column_name = 'id' AND data_type = 'uuid'
  ) THEN
    RAISE NOTICE '[cutover] public.transactions 가 이미 신 스키마(uuid PK) — 이동 스킵';
    RETURN;
  END IF;

  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
        RAISE NOTICE '[cutover] realtime publication 에서 제거: %', t;
      END IF;
      EXECUTE format('ALTER TABLE public.%I SET SCHEMA legacy', t);
      RAISE NOTICE '[cutover] 이동: public.% → legacy.%', t, t;
    ELSE
      RAISE NOTICE '[cutover] public.% 없음 — 스킵(이미 이동됨)', t;
    END IF;
  END LOOP;

  -- 구 이벤트 트리거 함수도 legacy 로 이동 (이벤트 트리거 자체는 oid 참조라 계속 동작 —
  -- public 신규 테이블 RLS 자동 활성화는 무해하므로 유지)
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'rls_auto_enable') THEN
    EXECUTE 'ALTER FUNCTION public.rls_auto_enable() SET SCHEMA legacy';
    RAISE NOTICE '[cutover] 이동: public.rls_auto_enable() → legacy';
  END IF;
END $$;

-- PostgREST/anon 노출 차단 (§1.3)
REVOKE ALL ON SCHEMA legacy FROM anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA legacy FROM anon, authenticated;

COMMIT;

-- 이동 결과 확인
SELECT 'legacy' AS schema, count(*) AS tables FROM pg_tables WHERE schemaname = 'legacy'
UNION ALL
SELECT 'public', count(*) FROM pg_tables WHERE schemaname = 'public';
