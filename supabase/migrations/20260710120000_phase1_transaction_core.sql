-- Phase 1a: 거래 코어 — categories / accounts / tags / transactions / transaction_tags
-- + account_balances_v + create/update/delete_transaction RPC + 인덱스 + RLS
-- 스펙: docs/DB.md §1(테이블), §2.1(잔액 뷰), §3.1-3.3(RPC), §4(인덱스), §5(RLS)

-- ============================================================
-- 1. 테이블 (DB.md §1)
-- ============================================================

-- 1.1 categories
CREATE TABLE public.categories (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  type         text NOT NULL CHECK (type IN ('income', 'expense')),
  expense_kind text CHECK (expense_kind IN ('consumption', 'saving')),
  icon         text,
  color        text,
  parent_id    uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  sort_order   integer NOT NULL DEFAULT 0,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  -- 지출 카테고리는 expense_kind 필수(예산·결산 저축 집계의 전제), 수입 카테고리는 금지
  CONSTRAINT chk_categories_expense_kind
    CHECK ((type = 'expense' AND expense_kind IS NOT NULL)
        OR (type = 'income'  AND expense_kind IS NULL))
);

CREATE TRIGGER trg_categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 1.2 accounts
-- 주의: asset_id FK(→ public.assets)는 assets 테이블이 자산 트랙(Phase 2)에서 생성된 뒤
--       ALTER TABLE public.accounts ADD CONSTRAINT fk_accounts_asset_id
--         FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE SET NULL;
--       로 후행 부착한다 (DB.md §1.2 주석).
CREATE TABLE public.accounts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  type              text NOT NULL CHECK (type IN ('cash','bank','card','savings','investment')),
  initial_balance   bigint NOT NULL DEFAULT 0,
  -- current_balance 삭제: account_balances_v 로 파생
  color             text,
  icon              text,
  is_active         boolean NOT NULL DEFAULT true,
  sort_order        integer NOT NULL DEFAULT 0,
  asset_id          uuid, -- FK는 Phase 2(자산 트랙)에서 부착 — 위 주석 참조
  deposit_type      text CHECK (deposit_type IN ('lump_sum','installment')),
  term_months       integer CHECK (term_months IS NULL OR term_months > 0),
  interest_rate     numeric(10,4),
  tax_type          text CHECK (tax_type IN ('normal','preferential','tax_free','high')),
  open_date         date,
  monthly_payment   bigint,
  billing_day       integer CHECK (billing_day IS NULL OR billing_day BETWEEN 1 AND 31),
  credit_limit      bigint,
  linked_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_accounts_updated_at
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 1.4 tags
CREATE TABLE public.tags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  color      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 1.3 transactions
-- 주의: recurring_id FK(→ public.recurring_transactions)는 정기거래 트랙에서
--       recurring_transactions 생성 후
--       ALTER TABLE public.transactions ADD CONSTRAINT fk_tx_recurring_id
--         FOREIGN KEY (recurring_id) REFERENCES public.recurring_transactions(id) ON DELETE SET NULL;
--       로 후행 부착한다.
CREATE TABLE public.transactions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type                text NOT NULL CHECK (type IN ('income','expense','transfer')),
  amount              bigint NOT NULL CHECK (amount > 0),
  description         text NOT NULL,
  status              text NOT NULL DEFAULT 'applied' CHECK (status IN ('pending','applied')),
  category_id         uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  account_id          uuid NOT NULL REFERENCES public.accounts(id),
  to_account_id       uuid REFERENCES public.accounts(id),
  recurring_id        uuid, -- FK는 정기거래 트랙에서 부착 — 위 주석 참조
  date                date NOT NULL,
  memo                text,
  installment_months  integer CHECK (installment_months IS NULL OR installment_months > 0),
  installment_current integer CHECK (installment_current IS NULL OR installment_current > 0),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  -- 이체는 입금 계좌 필수, 수입은 입금 계좌 금지(출금 계좌 자체가 입금 대상)
  CONSTRAINT chk_tx_transfer_to_account CHECK (type <> 'transfer' OR to_account_id IS NOT NULL),
  CONSTRAINT chk_tx_income_no_to       CHECK (type <> 'income'   OR to_account_id IS NULL),
  CONSTRAINT chk_tx_no_self_transfer   CHECK (to_account_id IS NULL OR to_account_id <> account_id)
);

CREATE TRIGGER trg_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 저축 거래 = type='expense' + to_account_id NOT NULL + 카테고리 expense_kind='saving'.
-- CHECK로 강제하지 않는 이유: 카테고리 조인이 필요해 CHECK로 표현 불가
-- → create_transaction RPC 검증 + pgTAP 테스트로 보증 (DB.md §1.3 주석).

-- 1.4 transaction_tags
CREATE TABLE public.transaction_tags (
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  tag_id         uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, tag_id)
);

-- ============================================================
-- 2. account_balances_v — 잔액의 유일한 진실 (DB.md §2.1)
-- ============================================================
-- ⚠️ Phase 2C(투자 트랙)에서 investment_trades 테이블 생성 후 아래 뷰를
--    CREATE OR REPLACE VIEW로 확장한다. DB.md §2.1의 전체 정의(투자 매매 효과 포함)는
--    이 블록 하단 주석에 보존되어 있다 — 현재는 investment_trades 부재로 tr 분기 생략.
CREATE OR REPLACE VIEW public.account_balances_v
WITH (security_invoker = on) AS
SELECT
  a.id          AS account_id,
  a.name,
  a.type,
  a.is_active,
  a.initial_balance,
  (a.initial_balance
   + COALESCE(tx.net_effect, 0))::bigint AS current_balance
FROM public.accounts a
LEFT JOIN (
  -- 거래 효과: status='applied'만 집계
  SELECT e.account_id, SUM(e.effect)::bigint AS net_effect
  FROM (
    -- 출금/수입 측: income +, expense/transfer −
    SELECT account_id,
           CASE WHEN type = 'income' THEN amount ELSE -amount END AS effect
    FROM public.transactions
    WHERE status = 'applied'
    UNION ALL
    -- 입금 측: transfer + 저축성 expense(to_account_id 보유) → toAccount +amount
    SELECT to_account_id, amount
    FROM public.transactions
    WHERE status = 'applied'
      AND to_account_id IS NOT NULL
      AND type IN ('transfer', 'expense')
  ) e
  GROUP BY e.account_id
) tx ON tx.account_id = a.id;

-- [Phase 2C에서 복원할 전체 정의 — DB.md §2.1]
-- CREATE OR REPLACE VIEW public.account_balances_v
-- WITH (security_invoker = on) AS
-- SELECT
--   a.id AS account_id, a.name, a.type, a.is_active, a.initial_balance,
--   (a.initial_balance
--    + COALESCE(tx.net_effect, 0)
--    + COALESCE(tr.net_effect, 0))::bigint AS current_balance
-- FROM public.accounts a
-- LEFT JOIN ( …위 tx 서브쿼리 동일… ) tx ON tx.account_id = a.id
-- LEFT JOIN (
--   -- 투자 매매의 계좌 효과: buy −total_amount, sell/dividend +net_amount
--   SELECT account_id,
--          SUM(CASE WHEN trade_type = 'buy' THEN -total_amount
--                   ELSE net_amount END)::bigint AS net_effect
--   FROM public.investment_trades
--   WHERE account_id IS NOT NULL
--   GROUP BY account_id
-- ) tr ON tr.account_id = a.id;

-- ============================================================
-- 3. RPC 함수 (DB.md §3.1-3.3)
--    쓰기 RPC는 단일 왕복·원자 처리. 잔액 UPDATE 없음(파생이므로).
-- ============================================================

-- 3.1 create_transaction(p jsonb) → transactions
CREATE OR REPLACE FUNCTION public.create_transaction(p jsonb)
RETURNS public.transactions
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_row  public.transactions;
  v_tags text[] := COALESCE(
    (SELECT array_agg(DISTINCT trim(t))
       FROM jsonb_array_elements_text(COALESCE(p->'tags', '[]'::jsonb)) t
      WHERE trim(t) <> ''),
    '{}');
BEGIN
  -- 저축 거래 정합성 검증: saving 카테고리 expense는 to_account_id 필수
  -- (소분류는 부모의 expense_kind를 상속 — COALESCE 롤업, PRD §5 규칙 1)
  IF (p->>'type') = 'expense'
     AND EXISTS (
       SELECT 1 FROM categories c
       WHERE c.id = NULLIF(p->>'category_id','')::uuid
         AND COALESCE(
               (SELECT pc.expense_kind FROM categories pc WHERE pc.id = c.parent_id),
               c.expense_kind) = 'saving')
     AND NULLIF(p->>'to_account_id','') IS NULL THEN
    RAISE EXCEPTION '저축 거래는 입금 계좌(to_account_id)가 필요합니다' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO transactions (
    type, amount, description, status, category_id, account_id,
    to_account_id, recurring_id, date, memo,
    installment_months, installment_current
  ) VALUES (
    p->>'type',
    (p->>'amount')::bigint,
    p->>'description',
    COALESCE(p->>'status', 'applied'),
    NULLIF(p->>'category_id','')::uuid,
    (p->>'account_id')::uuid,
    NULLIF(p->>'to_account_id','')::uuid,
    NULLIF(p->>'recurring_id','')::uuid,
    (p->>'date')::date,
    p->>'memo',
    NULLIF(p->>'installment_months','')::integer,
    NULLIF(p->>'installment_current','')::integer
  )
  RETURNING * INTO v_row;

  -- 태그 upsert: unnest 배열, 루프 없음
  -- [경합 주석] 동시 동일 신규 태그 삽입 시, ON CONFLICT DO NOTHING 이후의 SELECT 에서
  -- 상대 트랜잭션의 커밋 전 행이 보이지 않아 태그 연결이 조용히 누락될 수 있음.
  -- 단일 사용자 앱에서 허용 — 클라이언트 재시도(거래 수정)로 복구 가능.
  IF cardinality(v_tags) > 0 THEN
    INSERT INTO tags (name)
    SELECT unnest(v_tags)
    ON CONFLICT (name) DO NOTHING;

    INSERT INTO transaction_tags (transaction_id, tag_id)
    SELECT v_row.id, tg.id
    FROM tags tg
    WHERE tg.name = ANY (v_tags)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_row;
END $$;

-- 3.2 update_transaction(p_id uuid, p jsonb) → transactions
-- 잔액이 파생이므로 역계산·보정 로직 없음 — 단순 부분 UPDATE + 태그 교체 (DB.md §3.2)
CREATE OR REPLACE FUNCTION public.update_transaction(p_id uuid, p jsonb)
RETURNS public.transactions
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_row  public.transactions;
  v_tags text[];
BEGIN
  UPDATE transactions SET
    type          = CASE WHEN p ? 'type'        THEN p->>'type'                          ELSE type          END,
    amount        = CASE WHEN p ? 'amount'      THEN (p->>'amount')::bigint              ELSE amount        END,
    description   = CASE WHEN p ? 'description' THEN p->>'description'                   ELSE description   END,
    status        = CASE WHEN p ? 'status'      THEN p->>'status'                        ELSE status        END,
    category_id   = CASE WHEN p ? 'category_id' THEN NULLIF(p->>'category_id','')::uuid  ELSE category_id   END,
    account_id    = CASE WHEN p ? 'account_id'  THEN (p->>'account_id')::uuid            ELSE account_id    END,
    to_account_id = CASE WHEN p ? 'to_account_id' THEN NULLIF(p->>'to_account_id','')::uuid ELSE to_account_id END,
    date          = CASE WHEN p ? 'date'        THEN (p->>'date')::date                  ELSE date          END,
    memo          = CASE WHEN p ? 'memo'        THEN p->>'memo'                          ELSE memo          END,
    installment_months  = CASE WHEN p ? 'installment_months'
                               THEN NULLIF(p->>'installment_months','')::integer
                               ELSE installment_months END,
    installment_current = CASE WHEN p ? 'installment_current'
                               THEN NULLIF(p->>'installment_current','')::integer
                               ELSE installment_current END
  WHERE id = p_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TRANSACTION_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF p ? 'tags' THEN
    v_tags := COALESCE(
      (SELECT array_agg(DISTINCT trim(t))
         FROM jsonb_array_elements_text(p->'tags') t
        WHERE trim(t) <> ''),
      '{}');

    DELETE FROM transaction_tags WHERE transaction_id = p_id;

    -- 태그 upsert: create_transaction(§3.1)과 동일한 unnest 블록 — 경합 주석 동일 적용
    IF cardinality(v_tags) > 0 THEN
      INSERT INTO tags (name)
      SELECT unnest(v_tags)
      ON CONFLICT (name) DO NOTHING;

      INSERT INTO transaction_tags (transaction_id, tag_id)
      SELECT p_id, tg.id
      FROM tags tg
      WHERE tg.name = ANY (v_tags)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN v_row;
END $$;

-- 3.3 delete_transaction(p_id uuid) → boolean
CREATE OR REPLACE FUNCTION public.delete_transaction(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  DELETE FROM transactions WHERE id = p_id;  -- transaction_tags는 FK CASCADE
  RETURN FOUND;
END $$;

-- ============================================================
-- 4. 인덱스 (DB.md §4 — 이 마이그레이션 대상 테이블 전부)
-- ============================================================

-- categories
CREATE INDEX idx_categories_type      ON public.categories (type);
CREATE INDEX idx_categories_parent_id ON public.categories (parent_id);

-- accounts
CREATE INDEX idx_accounts_type              ON public.accounts (type);
CREATE INDEX idx_accounts_asset_id          ON public.accounts (asset_id) WHERE asset_id IS NOT NULL;
CREATE INDEX idx_accounts_linked_account_id ON public.accounts (linked_account_id) WHERE linked_account_id IS NOT NULL;

-- transactions (잔액 뷰·결산·목록의 핵심)
CREATE INDEX idx_tx_account_status  ON public.transactions (account_id, status) INCLUDE (type, amount);
CREATE INDEX idx_tx_to_account      ON public.transactions (to_account_id, status) INCLUDE (amount)
  WHERE to_account_id IS NOT NULL;
CREATE INDEX idx_tx_date_type_status ON public.transactions (date, type, status);
CREATE INDEX idx_tx_category_id     ON public.transactions (category_id);
CREATE INDEX idx_tx_recurring_id    ON public.transactions (recurring_id) WHERE recurring_id IS NOT NULL;
CREATE INDEX idx_tx_pending_date    ON public.transactions (date) WHERE status = 'pending';  -- process_due 전용

-- transaction_tags (PK가 transaction_id 선두 → tag_id 역방향만 추가)
CREATE INDEX idx_transaction_tags_tag_id ON public.transaction_tags (tag_id);

-- ============================================================
-- 5. RLS (DB.md §5) — anon 완전 차단 + authenticated 소유자 이메일 검증
-- ============================================================
-- 소유자 이메일 설정 방식:
--   ALTER DATABASE postgres SET app.owner_email = '<소유자 이메일>';
--   (새 커넥션부터 적용. 운영 컷오버 시 수동 실행 — MIGRATION.md §7)
--   미설정 시 current_setting('app.owner_email', true)가 NULL → 정책 전부 거부(fail-closed).
-- 로컬: postgres 롤은 커스텀 GUC 영구 설정 권한이 없으므로 supabase_admin으로 실행한다
--   (구체 명령은 supabase/seed.sql 상단 주석 참조).
-- 로컬 통합 테스트는 postgres 롤(테이블 소유자)로 접속하므로 RLS를 우회한다 —
-- RLS는 PostgREST 노출 표면(anon/authenticated)을 보호하는 계층이다.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'categories','accounts','transactions','tags','transaction_tags'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I_owner_all ON public.%I
         FOR ALL TO authenticated
         USING (auth.jwt()->>''email'' = current_setting(''app.owner_email'', true))
         WITH CHECK (auth.jwt()->>''email'' = current_setting(''app.owner_email'', true))', t, t);
  END LOOP;
END $$;

-- anon 차단 + 기본 권한 정리 (DB.md §5의 스키마 전역 형태 그대로 — fail-closed).
-- 함수는 생성 시 PUBLIC EXECUTE가 기본 부여되므로 전역 REVOKE로 제거해야
-- set_updated_at() 등 비-RPC 함수와 이후 마이그레이션의 신규 함수도 기본 차단된다.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, public;

-- authenticated: 테이블/뷰 접근 + 쓰기 RPC 실행 (RLS 정책이 소유자 검증 담당)
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.categories, public.accounts, public.transactions,
     public.tags, public.transaction_tags
  TO authenticated;
GRANT SELECT ON public.account_balances_v TO authenticated;
GRANT EXECUTE ON FUNCTION
  public.create_transaction(jsonb),
  public.update_transaction(uuid, jsonb),
  public.delete_transaction(uuid)
TO authenticated;
