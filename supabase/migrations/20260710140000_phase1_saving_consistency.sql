-- Phase 1 리뷰 반영 (DB-H1, SEC-L2): 저축 거래 정합성 검증 강화 + RAISE ERRCODE 규약 도입.
--
-- 1) assert_tx_saving_consistency: 순방향(saving 카테고리 → to_account_id 필수)에 더해
--    역방향(type='expense' + to_account_id 보유 → 카테고리 expense_kind='saving' 필수, 부모 롤업)을
--    검증하는 공용 헬퍼. 카테고리가 없는 expense + to_account_id 조합도 거절한다.
-- 2) create_transaction: 인라인 검증을 헬퍼 호출로 교체 (역방향 검증 추가).
-- 3) update_transaction: 부분 PATCH 병합 후 "최종 상태" 기준으로 동일 검증을 수행한다
--    (기존에는 update 경로에 저축 검증이 전혀 없었다).
-- 4) RAISE 규약을 메시지 매칭에서 커스텀 SQLSTATE로 교체 (api-errors.ts와 1:1):
--    CF422 = 저축 정합성 위반(422 SAVING_CATEGORY_REQUIRED), CF404 = 자원 없음(404 NOT_FOUND).

-- ============================================================
-- 1. 저축 정합성 공용 헬퍼
-- ============================================================
CREATE OR REPLACE FUNCTION public.assert_tx_saving_consistency(
  p_type          text,
  p_category_id   uuid,
  p_to_account_id uuid
)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_kind text;
BEGIN
  IF p_type IS DISTINCT FROM 'expense' THEN
    RETURN; -- income/transfer는 테이블 CHECK 제약이 담당
  END IF;

  -- 소분류는 부모의 expense_kind를 상속 (COALESCE 롤업, PRD §5 규칙 1)
  SELECT COALESCE(pc.expense_kind, c.expense_kind) INTO v_kind
  FROM categories c
  LEFT JOIN categories pc ON pc.id = c.parent_id
  WHERE c.id = p_category_id;

  -- 순방향: saving 카테고리 지출은 입금 계좌 필수
  IF v_kind = 'saving' AND p_to_account_id IS NULL THEN
    RAISE EXCEPTION '저축 거래는 입금 계좌(to_account_id)가 필요합니다'
      USING ERRCODE = 'CF422';
  END IF;

  -- 역방향: 입금 계좌가 있는 지출은 saving 카테고리 필수 (카테고리 없음 포함)
  IF p_to_account_id IS NOT NULL AND v_kind IS DISTINCT FROM 'saving' THEN
    RAISE EXCEPTION '입금 계좌가 있는 지출 거래는 저축(expense_kind=saving) 카테고리가 필요합니다'
      USING ERRCODE = 'CF422';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.assert_tx_saving_consistency(text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_tx_saving_consistency(text, uuid, uuid) TO authenticated;

-- ============================================================
-- 2. create_transaction — 검증을 헬퍼로 교체 (본문은 20260710120000 §3.1 기반)
-- ============================================================
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
  -- 저축 거래 정합성 (순방향 + 역방향, DB-H1)
  PERFORM assert_tx_saving_consistency(
    p->>'type',
    NULLIF(p->>'category_id','')::uuid,
    NULLIF(p->>'to_account_id','')::uuid
  );

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

-- ============================================================
-- 3. update_transaction — 병합 후 최종 상태 기준 검증 추가 + CF404
--    (본문은 20260710120000 §3.2 기반)
-- ============================================================
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
    RAISE EXCEPTION 'TRANSACTION_NOT_FOUND' USING ERRCODE = 'CF404';
  END IF;

  -- 저축 거래 정합성 — 부분 PATCH 병합 후 "최종 상태" 기준 (DB-H1).
  -- 예외 발생 시 위 UPDATE는 같은 트랜잭션이므로 전체 롤백된다.
  PERFORM assert_tx_saving_consistency(v_row.type, v_row.category_id, v_row.to_account_id);

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

-- CREATE OR REPLACE는 기존 GRANT를 보존한다 (create/update_transaction — 20260710120000 §5).
