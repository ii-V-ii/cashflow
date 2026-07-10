-- Phase 2D: 정기거래 — recurring_transactions + transactions.recurring_id FK 후행 부착
-- + calc_next_date / recurring_json / create·update·delete_recurring
-- + process_due_transactions + 인덱스 + RLS + pg_cron
-- 스펙: docs/DB.md §1.7, §3.6, §3.7, §4, §5, §6 / docs/API.md §12 / docs/PRD.md §3.2, §5 규칙 4·8·10

-- ============================================================
-- 1. 테이블 (DB.md §1.7)
-- ============================================================

CREATE TABLE public.recurring_transactions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type           text NOT NULL CHECK (type IN ('income','expense','transfer')),
  amount         bigint NOT NULL CHECK (amount > 0),
  description    text NOT NULL,
  category_id    uuid REFERENCES public.categories(id),
  account_id     uuid NOT NULL REFERENCES public.accounts(id),
  to_account_id  uuid REFERENCES public.accounts(id),
  frequency      text NOT NULL CHECK (frequency IN ('daily','weekly','monthly','yearly')),
  recur_interval integer NOT NULL DEFAULT 1 CHECK (recur_interval >= 1), -- 구 "interval"(예약어 회피)
  start_date     date NOT NULL,
  end_date       date CHECK (end_date IS NULL OR end_date >= start_date),
  next_date      date NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_recurring_transactions_updated_at
  BEFORE UPDATE ON public.recurring_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- transactions.recurring_id FK 후행 부착 (Phase 1a 마이그레이션 주석 참조)
ALTER TABLE public.transactions
  ADD CONSTRAINT fk_tx_recurring_id
  FOREIGN KEY (recurring_id) REFERENCES public.recurring_transactions(id) ON DELETE SET NULL;

-- ============================================================
-- 2. calc_next_date — 월말/윤년 보정 헬퍼 (DB.md §3.6)
-- ============================================================
-- 레거시 TS(calculateNextDate)와 동일: 앵커는 "현재 next_date의 일(day)".
-- 1/31 → 2/28 이후에는 3/28로 진행(3/31 아님). TS ↔ SQL 케이스 테이블 교차 검증 대상.

CREATE OR REPLACE FUNCTION public.calc_next_date(
  p_current date, p_frequency text, p_interval integer
) RETURNS date
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_first date;   -- 대상 월 1일
  v_day   integer := EXTRACT(DAY FROM p_current)::integer;
BEGIN
  CASE p_frequency
    WHEN 'daily'  THEN RETURN p_current + p_interval;
    WHEN 'weekly' THEN RETURN p_current + p_interval * 7;
    WHEN 'monthly' THEN
      v_first := (date_trunc('month', p_current) + make_interval(months => p_interval))::date;
    WHEN 'yearly' THEN
      v_first := (date_trunc('month', p_current) + make_interval(years => p_interval))::date;
    ELSE RAISE EXCEPTION '알 수 없는 frequency: %', p_frequency USING ERRCODE = '23514';
  END CASE;
  -- 월말 보정: 1/31+1개월=2/28, 2/29(윤년)+1년=2/28
  RETURN v_first
       + LEAST(v_day,
               EXTRACT(DAY FROM (v_first + interval '1 month - 1 day'))::integer)
       - 1;
END $$;

-- ============================================================
-- 3. recurring_json — Recurring DTO(API.md §12.1) jsonb 헬퍼
-- ============================================================
-- create/update_recurring과 같은 문장에서 호출해도 방금 쓴 행이 보이도록
-- VOLATILE로 선언한다 (transaction_json과 동일 이유 — STABLE은 호출 문장의
-- 스냅샷을 쓰므로 같은 문장 안의 선행 INSERT/UPDATE를 보지 못한다).

CREATE OR REPLACE FUNCTION public.recurring_json(p_id uuid)
RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id', r.id,
    'type', r.type,
    'amount', r.amount,
    'description', r.description,
    'categoryId', r.category_id,
    'accountId', r.account_id,
    'toAccountId', r.to_account_id,
    'frequency', r.frequency,
    'interval', r.recur_interval,
    'startDate', to_char(r.start_date, 'YYYY-MM-DD'),
    'endDate', to_char(r.end_date, 'YYYY-MM-DD'),
    'nextDate', to_char(r.next_date, 'YYYY-MM-DD'),
    'isActive', r.is_active,
    'createdAt', r.created_at,
    'updatedAt', r.updated_at
  )
  FROM recurring_transactions r
  WHERE r.id = p_id
$$;

-- ============================================================
-- 4. refill_recurring_pending — 12개월 pending 재충전 (내부 헬퍼)
-- ============================================================
-- 기존 pending 마지막 날짜 이후 ~ horizon(오늘+12개월, end_date 상한)까지
-- calc_next_date로 전개해 INSERT ... SELECT unnest 1문장으로 생성 (DB.md §3.7 2c).
-- 같은 날짜가 이미 존재하면 건너뛴다(멱등 — 같은 날 중복 실행 안전).

CREATE OR REPLACE FUNCTION public.refill_recurring_pending(
  p_id uuid, p_today date
) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  r         public.recurring_transactions%ROWTYPE;
  v_horizon date;
  v_last    date;
  v_d       date;
  v_dates   date[] := '{}';
  v_count   integer := 0;
BEGIN
  SELECT * INTO r FROM recurring_transactions WHERE id = p_id;
  IF NOT FOUND OR NOT r.is_active THEN
    RETURN 0;
  END IF;

  v_horizon := LEAST(
    COALESCE(r.end_date, (p_today + interval '12 months')::date),
    (p_today + interval '12 months')::date);

  SELECT max(date) INTO v_last
  FROM transactions
  WHERE recurring_id = p_id AND status = 'pending';

  IF v_last IS NULL THEN
    v_d := r.next_date;
  ELSE
    v_d := calc_next_date(v_last, r.frequency, r.recur_interval);
  END IF;

  WHILE v_d <= v_horizon LOOP
    v_dates := array_append(v_dates, v_d);
    v_d := calc_next_date(v_d, r.frequency, r.recur_interval);
  END LOOP;

  IF cardinality(v_dates) = 0 THEN
    RETURN 0;
  END IF;

  INSERT INTO transactions
    (type, amount, description, status, category_id, account_id, to_account_id,
     recurring_id, date)
  SELECT r.type, r.amount, r.description, 'pending', r.category_id, r.account_id,
         r.to_account_id, r.id, d
  FROM unnest(v_dates) AS d
  WHERE NOT EXISTS (
    SELECT 1 FROM transactions t WHERE t.recurring_id = r.id AND t.date = d
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

-- ============================================================
-- 5. create_recurring(p_payload jsonb) → uuid (API.md §12.2)
-- ============================================================
-- 정의 INSERT + 향후 12개월 pending 거래 생성 원자(1왕복).
-- 검증 실패는 ERRCODE 23514(check_violation) → API 400 VALIDATION_ERROR 매핑.

CREATE OR REPLACE FUNCTION public.create_recurring(p jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_today      date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  v_type       text := p->>'type';
  v_amount     bigint := (p->>'amount')::bigint;
  v_account    uuid := (p->>'account_id')::uuid;
  v_to_account uuid := NULLIF(p->>'to_account_id','')::uuid;
  v_frequency  text := p->>'frequency';
  v_interval   integer := COALESCE(NULLIF(p->>'interval','')::integer, 1);
  v_start      date := (p->>'start_date')::date;
  v_end        date := NULLIF(p->>'end_date','')::date;
  v_next       date;
  v_active     boolean := true;
  v_id         uuid;
BEGIN
  IF v_type IS NULL OR v_type NOT IN ('income','expense','transfer') THEN
    RAISE EXCEPTION 'INVALID_RECURRING_TYPE' USING ERRCODE = '23514';
  END IF;
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_RECURRING_AMOUNT' USING ERRCODE = '23514';
  END IF;
  IF COALESCE(trim(p->>'description'), '') = '' THEN
    RAISE EXCEPTION 'INVALID_RECURRING_DESCRIPTION' USING ERRCODE = '23514';
  END IF;
  IF v_frequency IS NULL OR v_frequency NOT IN ('daily','weekly','monthly','yearly') THEN
    RAISE EXCEPTION 'INVALID_RECURRING_FREQUENCY' USING ERRCODE = '23514';
  END IF;
  IF v_interval < 1 OR v_interval > 365 THEN
    RAISE EXCEPTION 'INVALID_RECURRING_INTERVAL' USING ERRCODE = '23514';
  END IF;
  IF v_start IS NULL THEN
    RAISE EXCEPTION 'INVALID_RECURRING_START_DATE' USING ERRCODE = '23514';
  END IF;
  -- 시작일 하한 (Zod MIN_RECURRING_START_DATE와 동일): next_date 전개 루프가
  -- O(경과 기간)이므로 과거 무제한 입력은 커넥션(max 1)을 장시간 점유한다.
  IF v_start < DATE '1990-01-01' THEN
    RAISE EXCEPTION 'RECURRING_START_TOO_OLD' USING ERRCODE = '23514';
  END IF;
  IF v_end IS NOT NULL AND v_end < v_start THEN
    RAISE EXCEPTION 'INVALID_RECURRING_END_DATE' USING ERRCODE = '23514';
  END IF;
  -- 이체 정합성 (transactions CHECK와 동일 규칙)
  IF v_type = 'transfer' AND v_to_account IS NULL THEN
    RAISE EXCEPTION 'TRANSFER_REQUIRES_TO_ACCOUNT' USING ERRCODE = '23514';
  END IF;
  IF v_type = 'income' AND v_to_account IS NOT NULL THEN
    RAISE EXCEPTION 'INCOME_FORBIDS_TO_ACCOUNT' USING ERRCODE = '23514';
  END IF;
  IF v_to_account IS NOT NULL AND v_to_account = v_account THEN
    RAISE EXCEPTION 'SELF_TRANSFER_FORBIDDEN' USING ERRCODE = '23514';
  END IF;

  -- 다음 발생일: 시작일부터 오늘 이상이 될 때까지 전개 (레거시 generateFutureTransactions)
  v_next := v_start;
  WHILE v_next < v_today LOOP
    v_next := calc_next_date(v_next, v_frequency, v_interval);
  END LOOP;

  IF v_end IS NOT NULL AND v_next > v_end THEN
    v_active := false; -- 이미 기간이 끝난 규칙 — pending 생성 없음
  END IF;

  INSERT INTO recurring_transactions
    (type, amount, description, category_id, account_id, to_account_id,
     frequency, recur_interval, start_date, end_date, next_date, is_active)
  VALUES
    (v_type, v_amount, p->>'description', NULLIF(p->>'category_id','')::uuid,
     v_account, v_to_account, v_frequency, v_interval, v_start, v_end,
     v_next, v_active)
  RETURNING id INTO v_id;

  PERFORM refill_recurring_pending(v_id, v_today);
  RETURN v_id;
END $$;

-- ============================================================
-- 6. update_recurring(p_id uuid, p_payload jsonb) → uuid (API.md §12.4)
-- ============================================================
-- 부분 수정 + 미래 pending 재생성(1왕복). applied 이력은 불변.

CREATE OR REPLACE FUNCTION public.update_recurring(p_id uuid, p jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  r       public.recurring_transactions%ROWTYPE;
  v_next  date;
BEGIN
  UPDATE recurring_transactions SET
    type          = CASE WHEN p ? 'type'        THEN p->>'type'                          ELSE type          END,
    amount        = CASE WHEN p ? 'amount'      THEN (p->>'amount')::bigint              ELSE amount        END,
    description   = CASE WHEN p ? 'description' THEN p->>'description'                   ELSE description   END,
    category_id   = CASE WHEN p ? 'category_id' THEN NULLIF(p->>'category_id','')::uuid  ELSE category_id   END,
    account_id    = CASE WHEN p ? 'account_id'  THEN (p->>'account_id')::uuid            ELSE account_id    END,
    to_account_id = CASE WHEN p ? 'to_account_id' THEN NULLIF(p->>'to_account_id','')::uuid ELSE to_account_id END,
    frequency     = CASE WHEN p ? 'frequency'   THEN p->>'frequency'                     ELSE frequency     END,
    recur_interval = CASE WHEN p ? 'interval'   THEN (p->>'interval')::integer           ELSE recur_interval END,
    start_date    = CASE WHEN p ? 'start_date'  THEN (p->>'start_date')::date            ELSE start_date    END,
    end_date      = CASE WHEN p ? 'end_date'    THEN NULLIF(p->>'end_date','')::date     ELSE end_date      END,
    is_active     = CASE WHEN p ? 'is_active'   THEN (p->>'is_active')::boolean          ELSE is_active     END
  WHERE id = p_id
  RETURNING * INTO r;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RECURRING_NOT_FOUND' USING ERRCODE = 'CF404';
  END IF;

  -- 병합 결과 정합성 검증 (테이블 CHECK가 커버하지 못하는 조합 규칙)
  IF r.type = 'transfer' AND r.to_account_id IS NULL THEN
    RAISE EXCEPTION 'TRANSFER_REQUIRES_TO_ACCOUNT' USING ERRCODE = '23514';
  END IF;
  IF r.type = 'income' AND r.to_account_id IS NOT NULL THEN
    RAISE EXCEPTION 'INCOME_FORBIDS_TO_ACCOUNT' USING ERRCODE = '23514';
  END IF;
  IF r.to_account_id IS NOT NULL AND r.to_account_id = r.account_id THEN
    RAISE EXCEPTION 'SELF_TRANSFER_FORBIDDEN' USING ERRCODE = '23514';
  END IF;
  IF r.recur_interval < 1 OR r.recur_interval > 365 THEN
    RAISE EXCEPTION 'INVALID_RECURRING_INTERVAL' USING ERRCODE = '23514';
  END IF;
  -- 시작일 하한 (create_recurring과 동일 — 병합 결과 기준)
  IF r.start_date < DATE '1990-01-01' THEN
    RAISE EXCEPTION 'RECURRING_START_TOO_OLD' USING ERRCODE = '23514';
  END IF;

  -- 미래 pending 삭제 (오늘 포함 이후 — 레거시 deleteFutureByRecurringId 동작).
  -- applied 이력은 건드리지 않는다.
  DELETE FROM transactions
  WHERE recurring_id = p_id AND status = 'pending' AND date >= v_today;

  -- next_date 재계산: 시작일부터 오늘 이상까지 전개 (start_date 기준 결정적 체인)
  v_next := r.start_date;
  WHILE v_next < v_today LOOP
    v_next := calc_next_date(v_next, r.frequency, r.recur_interval);
  END LOOP;

  IF r.end_date IS NOT NULL AND v_next > r.end_date THEN
    UPDATE recurring_transactions
    SET is_active = false, next_date = v_next WHERE id = p_id;
  ELSE
    UPDATE recurring_transactions SET next_date = v_next WHERE id = p_id;
    -- is_active=true인 경우에만 재생성 (refill이 내부에서 비활성 규칙을 건너뛴다)
    PERFORM refill_recurring_pending(p_id, v_today);
  END IF;

  RETURN p_id;
END $$;

-- ============================================================
-- 7. delete_recurring(p_id uuid) → boolean (API.md §12.5)
-- ============================================================
-- 미래 pending 삭제 + 정의 삭제. applied 이력은 FK ON DELETE SET NULL로 보존.

CREATE OR REPLACE FUNCTION public.delete_recurring(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  DELETE FROM transactions WHERE recurring_id = p_id AND status = 'pending';
  DELETE FROM recurring_transactions WHERE id = p_id;
  RETURN FOUND;
END $$;

-- ============================================================
-- 8. process_due_transactions(p_today) → jsonb (DB.md §3.7)
-- ============================================================
-- 도래 pending → applied 전환 + next_date 전진(월말 보정) + 12개월 pending 재충전.
-- 멱등: 같은 날 재실행 시 (1)은 대상 없음, 재충전은 기존 pending 이후만 생성.

CREATE OR REPLACE FUNCTION public.process_due_transactions(
  p_today date DEFAULT (now() AT TIME ZONE 'Asia/Seoul')::date
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_applied     integer := 0;
  v_generated   integer := 0;
  v_deactivated integer := 0;
  v_next        date;
  r             record;
BEGIN
  -- 1. 도래한 pending 거래 적용 (정기 여부 무관 — 잔액 뷰는 applied만 집계)
  UPDATE transactions SET status = 'applied'
  WHERE status = 'pending' AND date <= p_today;
  GET DIAGNOSTICS v_applied = ROW_COUNT;

  -- 2. 도래 규칙 전진 + 재충전
  FOR r IN
    SELECT * FROM recurring_transactions
    WHERE is_active AND next_date <= p_today
    FOR UPDATE
  LOOP
    v_next := r.next_date;
    WHILE v_next <= p_today LOOP
      v_next := calc_next_date(v_next, r.frequency, r.recur_interval); -- 월말 보정
    END LOOP;

    IF r.end_date IS NOT NULL AND v_next > r.end_date THEN
      UPDATE recurring_transactions
      SET is_active = false, next_date = v_next WHERE id = r.id;
      v_deactivated := v_deactivated + 1;
    ELSE
      UPDATE recurring_transactions SET next_date = v_next WHERE id = r.id;
      v_generated := v_generated + refill_recurring_pending(r.id, p_today);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'applied', v_applied,
    'generated', v_generated,
    'deactivated', v_deactivated,
    'generated_through', to_char((p_today + interval '12 months')::date, 'YYYY-MM-DD'));
END $$;

-- ============================================================
-- 9. 인덱스 (DB.md §4)
-- ============================================================
-- idx_tx_recurring_id / idx_tx_pending_date 는 Phase 1a에서 이미 생성됨.

CREATE INDEX idx_recurring_due ON public.recurring_transactions (next_date) WHERE is_active;

-- ============================================================
-- 10. RLS + 권한 (DB.md §5) — anon 완전 차단 + 소유자 이메일 검증
-- ============================================================

ALTER TABLE public.recurring_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY recurring_transactions_owner_all ON public.recurring_transactions
  FOR ALL TO authenticated
  USING (auth.jwt()->>'email' = current_setting('app.owner_email', true))
  WITH CHECK (auth.jwt()->>'email' = current_setting('app.owner_email', true));

-- 신규 함수는 생성 시 PUBLIC EXECUTE가 기본 부여되므로 명시적으로 제거한다
REVOKE ALL ON FUNCTION
  public.calc_next_date(date, text, integer),
  public.recurring_json(uuid),
  public.refill_recurring_pending(uuid, date),
  public.create_recurring(jsonb),
  public.update_recurring(uuid, jsonb),
  public.delete_recurring(uuid),
  public.process_due_transactions(date)
FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.recurring_transactions TO authenticated;

GRANT EXECUTE ON FUNCTION
  public.calc_next_date(date, text, integer),
  public.recurring_json(uuid),
  public.create_recurring(jsonb),
  public.update_recurring(uuid, jsonb),
  public.delete_recurring(uuid),
  public.process_due_transactions(date)
TO authenticated;
-- refill_recurring_pending은 내부 헬퍼 — authenticated 직접 호출 불가(RPC 화이트리스트에도 없음)

-- ============================================================
-- 11. pg_cron 잡 (DB.md §6) — 매일 00:05 KST(=15:05 UTC)
-- ============================================================
-- 로컬 Supabase 등 pg_cron 미지원 환경에서는 스킵한다(온디맨드 보정이 대체 경로).

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.schedule(
    'process-due-transactions',
    '5 15 * * *',
    $job$SELECT public.process_due_transactions()$job$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron 사용 불가 — 크론 잡 등록 스킵 (온디맨드 보정으로 대체): %', SQLERRM;
END $$;
