-- Phase 2A: 예산 — budgets / budget_items + budget_totals_v
-- + 예산 RPC(create/update/copy/upsert_cell/get_budget_actuals/get_annual_grid/get_budget_summary)
-- + 인덱스 + RLS
-- 스펙: docs/DB.md §1.5(테이블), §2.4(합계 뷰), §3.11(실적), §3.12(연간 그리드),
--       §4(인덱스), §5(RLS) / docs/API.md §6
-- 도메인 규칙(PRD §5): 실적은 status='applied'만, 저축(expense+saving) 포함,
--   대분류 롤업 COALESCE(parent_id, id), 예산 없는 실적은 planned 0 가상 항목.

-- ============================================================
-- 1. 테이블 (DB.md §1.5)
-- ============================================================

CREATE TABLE public.budgets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  year       integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  month      integer CHECK (month IS NULL OR month BETWEEN 1 AND 12), -- NULL = 연간 예산
  -- total_income / total_expense 저장 컬럼 없음: budget_totals_v 로 파생 (설계 제1원칙)
  memo       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- PG15+: 연간 예산(month=NULL)도 연도당 1개만 허용
  CONSTRAINT uq_budgets_year_month UNIQUE NULLS NOT DISTINCT (year, month)
);

CREATE TRIGGER trg_budgets_updated_at
  BEFORE UPDATE ON public.budgets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.budget_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id      uuid NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
  category_id    uuid NOT NULL REFERENCES public.categories(id),
  planned_amount bigint NOT NULL CHECK (planned_amount >= 0),
  memo           text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_budget_items_budget_category UNIQUE (budget_id, category_id)
);

CREATE TRIGGER trg_budget_items_updated_at
  BEFORE UPDATE ON public.budget_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 1.5 카테고리 깊이 불변식 (리뷰 HIGH2)
--     Phase 1 API가 2단계 제한(MAX_DEPTH_EXCEEDED)을 검증하지만 DB 불변식이 없었다.
--     예산 롤업(COALESCE(parent_id, id))·실적 부착 규칙이 깊이 2를 전제하므로
--     DB 차원에서 고정한다. ERRCODE 23514(check_violation) → API 400 VALIDATION_ERROR.
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_category_depth()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    -- 부모가 이미 소분류면 깊이 3 → 금지
    IF EXISTS (
      SELECT 1 FROM categories p
      WHERE p.id = NEW.parent_id AND p.parent_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION '카테고리는 최대 2단계까지만 허용됩니다'
        USING ERRCODE = '23514';
    END IF;
    -- 자식을 가진 대분류를 소분류로 강등해도 깊이 3 → 금지
    IF EXISTS (SELECT 1 FROM categories c WHERE c.parent_id = NEW.id) THEN
      RAISE EXCEPTION '하위 분류가 있는 카테고리는 소분류로 바꿀 수 없습니다'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_categories_max_depth
  BEFORE INSERT OR UPDATE OF parent_id ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.enforce_category_depth();

-- ============================================================
-- 2. budget_totals_v — 예산 합계 (DB.md §2.4)
--    같은 예산 안에 소분류 항목이 존재하는 대분류 항목은 합계에서 제외(중복 방지).
-- ============================================================

CREATE OR REPLACE VIEW public.budget_totals_v
WITH (security_invoker = on) AS
SELECT
  b.id AS budget_id,
  b.year,
  b.month,
  COALESCE(SUM(bi.planned_amount) FILTER (WHERE c.type = 'income'),  0)::bigint AS total_income,
  COALESCE(SUM(bi.planned_amount) FILTER (WHERE c.type = 'expense'), 0)::bigint AS total_expense
FROM public.budgets b
LEFT JOIN public.budget_items bi
  ON bi.budget_id = b.id
  AND NOT EXISTS (               -- 소분류 항목이 있는 대분류는 제외
    SELECT 1
    FROM public.budget_items bic
    JOIN public.categories cc ON cc.id = bic.category_id
    WHERE bic.budget_id = b.id AND cc.parent_id = bi.category_id
  )
LEFT JOIN public.categories c ON c.id = bi.category_id
GROUP BY b.id, b.year, b.month;

-- ============================================================
-- 3. RPC 함수 (DB.md §3.11-3.12, API.md §6)
--    RAISE 규약(SEC-L2): CF404 = 자원 없음, CF409 = 동일 연·월 예산 중복.
-- ============================================================

-- 3.0 budget_json — Budget DTO(API.md §6.2) jsonb 조립 (쓰기 RPC 공용 내부 헬퍼)
CREATE OR REPLACE FUNCTION public.budget_json(p_budget_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id', b.id,
    'name', b.name,
    'year', b.year,
    'month', b.month,
    'memo', b.memo,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', bi.id,
        'categoryId', bi.category_id,
        'category', jsonb_build_object(
          'id', c.id, 'name', c.name, 'type', c.type,
          'icon', c.icon, 'color', c.color,
          'expenseKind', c.expense_kind, 'parentId', c.parent_id),
        'plannedAmount', bi.planned_amount,
        'memo', bi.memo)
        -- 수입 항목 우선 정렬 (리뷰 L9 — UI 관례: 수입 → 지출)
        ORDER BY c.type DESC, c.sort_order, c.name)
      FROM budget_items bi
      JOIN categories c ON c.id = bi.category_id
      WHERE bi.budget_id = b.id), '[]'::jsonb),
    'createdAt', b.created_at,
    'updatedAt', b.updated_at)
  FROM budgets b
  WHERE b.id = p_budget_id;
$$;

-- 3.1 create_budget(p jsonb) → jsonb (budget + items 배치 INSERT 원자 처리, API.md §6.2)
CREATE OR REPLACE FUNCTION public.create_budget(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_budget_id uuid;
BEGIN
  BEGIN
    INSERT INTO budgets (name, year, month, memo)
    VALUES (
      p->>'name',
      (p->>'year')::integer,
      NULLIF(p->>'month', '')::integer,
      p->>'memo'
    )
    RETURNING id INTO v_budget_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION '동일한 연·월의 예산이 이미 존재합니다' USING ERRCODE = 'CF409';
  END;

  INSERT INTO budget_items (budget_id, category_id, planned_amount, memo)
  SELECT
    v_budget_id,
    (item->>'category_id')::uuid,
    (item->>'planned_amount')::bigint,
    item->>'memo'
  FROM jsonb_array_elements(COALESCE(p->'items', '[]'::jsonb)) item;

  RETURN public.budget_json(v_budget_id);
END $$;

-- 3.2 update_budget(p_id uuid, p jsonb) → jsonb (items 전달 시 전량 교체, API.md §6.4)
CREATE OR REPLACE FUNCTION public.update_budget(p_id uuid, p jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  UPDATE budgets SET
    name = CASE WHEN p ? 'name' THEN p->>'name' ELSE name END,
    memo = CASE WHEN p ? 'memo' THEN p->>'memo' ELSE memo END
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BUDGET_NOT_FOUND' USING ERRCODE = 'CF404';
  END IF;

  IF p ? 'items' THEN
    DELETE FROM budget_items WHERE budget_id = p_id;

    INSERT INTO budget_items (budget_id, category_id, planned_amount, memo)
    SELECT
      p_id,
      (item->>'category_id')::uuid,
      (item->>'planned_amount')::bigint,
      item->>'memo'
    FROM jsonb_array_elements(p->'items') item;
  END IF;

  RETURN public.budget_json(p_id);
END $$;

-- 3.3 copy_budget(...) → jsonb (전월 복사 INSERT … SELECT 1왕복, API.md §6.6)
CREATE OR REPLACE FUNCTION public.copy_budget(
  p_source_year integer, p_source_month integer,
  p_target_year integer, p_target_month integer
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_source_id uuid;
  v_target_id uuid;
BEGIN
  SELECT id INTO v_source_id
  FROM budgets
  WHERE year = p_source_year AND month = p_source_month;

  IF v_source_id IS NULL THEN
    RAISE EXCEPTION '복사할 원본 예산이 없습니다' USING ERRCODE = 'CF404';
  END IF;

  BEGIN
    INSERT INTO budgets (name, year, month, memo)
    SELECT format('%s년 %s월 예산', p_target_year, p_target_month), p_target_year, p_target_month, memo
    FROM budgets WHERE id = v_source_id
    RETURNING id INTO v_target_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION '대상 연·월에 예산이 이미 존재합니다' USING ERRCODE = 'CF409';
  END;

  INSERT INTO budget_items (budget_id, category_id, planned_amount, memo)
  SELECT v_target_id, category_id, planned_amount, memo
  FROM budget_items
  WHERE budget_id = v_source_id;

  RETURN public.budget_json(v_target_id);
END $$;

-- 3.4 upsert_budget_cell(...) → jsonb (연간 그리드 셀, API.md §6.9)
--     해당 월 예산·항목이 없으면 생성. amount 0 = 항목 삭제(itemId null 반환).
CREATE OR REPLACE FUNCTION public.upsert_budget_cell(
  p_year integer, p_month integer, p_category_id uuid, p_amount bigint
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_budget_id uuid;
  v_item_id   uuid;
BEGIN
  IF p_amount < 0 THEN
    RAISE EXCEPTION '금액은 0 이상이어야 합니다' USING ERRCODE = '23514';
  END IF;

  INSERT INTO budgets (name, year, month)
  VALUES (format('%s년 %s월 예산', p_year, p_month), p_year, p_month)
  ON CONFLICT ON CONSTRAINT uq_budgets_year_month DO NOTHING;

  SELECT id INTO v_budget_id
  FROM budgets
  WHERE year = p_year AND month = p_month;

  IF p_amount = 0 THEN
    DELETE FROM budget_items
    WHERE budget_id = v_budget_id AND category_id = p_category_id;
    RETURN jsonb_build_object('budgetId', v_budget_id, 'itemId', NULL, 'amount', 0);
  END IF;

  INSERT INTO budget_items (budget_id, category_id, planned_amount)
  VALUES (v_budget_id, p_category_id, p_amount)
  ON CONFLICT (budget_id, category_id)
  DO UPDATE SET planned_amount = EXCLUDED.planned_amount
  RETURNING id INTO v_item_id;

  RETURN jsonb_build_object('budgetId', v_budget_id, 'itemId', v_item_id, 'amount', p_amount);
END $$;

-- 3.5 get_budget_actuals(p_year, p_month) → jsonb (DB.md §3.11 — 가상 항목 포함)
--     실적 부착 규칙(구 budget-service 이식):
--       ① 실적 카테고리 자신의 예산 항목이 있으면 그 항목에
--       ② 없고 부모의 항목이 있으면 부모 항목에(대분류 롤업)
--       ③ 둘 다 없으면 대분류 키(COALESCE(parent_id, id))의 planned 0 가상 항목에
--     → "소분류 항목이 있는 부모의 롤업 실적 항목 제외(중복 방지)"가 자동 충족된다.
CREATE OR REPLACE FUNCTION public.get_budget_actuals(p_year integer, p_month integer)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
WITH b AS (
  SELECT id FROM budgets WHERE year = p_year AND month = p_month
),
planned AS (
  SELECT bi.category_id, bi.planned_amount, c.parent_id, c.name, c.type,
         COALESCE(pc.expense_kind, c.expense_kind) AS expense_kind
  FROM b
  JOIN budget_items bi ON bi.budget_id = b.id
  JOIN categories c    ON c.id = bi.category_id
  LEFT JOIN categories pc ON pc.id = c.parent_id
),
own AS (
  -- 카테고리 자신의 실적: applied만, income+expense(저축 포함), transfer 제외
  SELECT t.category_id, t.type, SUM(t.amount)::bigint AS amount
  FROM transactions t
  WHERE t.date >= make_date(p_year, p_month, 1)
    AND t.date <  make_date(p_year, p_month, 1) + interval '1 month'
    AND t.type IN ('income', 'expense')
    AND t.status = 'applied'
  GROUP BY t.category_id, t.type
),
attached AS (
  SELECT
    CASE
      WHEN ps.category_id IS NOT NULL THEN o.category_id            -- ① 자기 항목
      WHEN pp.category_id IS NOT NULL THEN c.parent_id              -- ② 부모 항목 롤업
      ELSE COALESCE(c.parent_id, o.category_id)                     -- ③ 대분류 가상 항목
    END AS category_id,
    o.type,
    o.amount
  FROM own o
  LEFT JOIN categories c ON c.id = o.category_id
  LEFT JOIN planned ps ON ps.category_id = o.category_id
  LEFT JOIN planned pp ON pp.category_id = c.parent_id
),
actuals AS (
  SELECT category_id, type, SUM(amount)::bigint AS amount
  FROM attached
  GROUP BY category_id, type
),
merged AS (
  SELECT
    COALESCE(pl.category_id, ac.category_id) AS category_id,
    COALESCE(pl.type, ac.type)               AS type,
    COALESCE(pl.planned_amount, 0)::bigint   AS planned_amount,
    COALESCE(ac.amount, 0)::bigint           AS actual_amount,
    pl.name                                  AS planned_name,
    pl.expense_kind                          AS planned_expense_kind
  FROM planned pl
  FULL OUTER JOIN actuals ac
    ON ac.category_id = pl.category_id AND ac.type = pl.type
),
items AS (
  SELECT
    m.category_id,
    COALESCE(m.planned_name, c.name, '미분류') AS category_name,
    m.type,
    COALESCE(m.planned_expense_kind, pc.expense_kind, c.expense_kind) AS expense_kind,
    m.planned_amount,
    m.actual_amount,
    (m.planned_amount - m.actual_amount)::bigint AS difference,
    CASE WHEN m.planned_amount > 0
         THEN round(m.actual_amount::numeric * 100 / m.planned_amount, 1)
         ELSE NULL END AS achievement_rate
  FROM merged m
  LEFT JOIN categories c  ON c.id = m.category_id
  LEFT JOIN categories pc ON pc.id = c.parent_id
)
SELECT jsonb_build_object(
  'budgetId', (SELECT id FROM b),
  'year', p_year,
  'month', p_month,
  'items', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'categoryId', i.category_id,
      'categoryName', i.category_name,
      'type', i.type,
      'expenseKind', i.expense_kind,
      'plannedAmount', i.planned_amount,
      'actualAmount', i.actual_amount,
      'difference', i.difference,
      'achievementRate', i.achievement_rate)
      -- budget_json과 동일한 수입 우선 정렬 (리뷰 L9)
      ORDER BY i.type DESC, i.planned_amount DESC, i.category_name)
    FROM items i), '[]'::jsonb),
  'totals', jsonb_build_object(
    'plannedIncome',  COALESCE((SELECT v.total_income  FROM budget_totals_v v WHERE v.budget_id = (SELECT id FROM b)), 0),
    'plannedExpense', COALESCE((SELECT v.total_expense FROM budget_totals_v v WHERE v.budget_id = (SELECT id FROM b)), 0),
    'actualIncome',  COALESCE((SELECT SUM(i.actual_amount) FROM items i WHERE i.type = 'income'),  0),
    'actualExpense', COALESCE((SELECT SUM(i.actual_amount) FROM items i WHERE i.type = 'expense'), 0)));
$$;

-- 3.6 get_annual_grid(p_year, p_type, p_expense_kind) → jsonb (DB.md §3.12)
--     그룹 키 = COALESCE(parent_id, category_id).
--     그룹 월합계: 소분류 항목이 있는 달은 소분류만 합산, 없으면 대분류 자신.
CREATE OR REPLACE FUNCTION public.get_annual_grid(
  p_year integer, p_type text DEFAULT NULL, p_expense_kind text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
WITH grid_rows AS (
  SELECT
    b.month,
    bi.category_id,
    c.parent_id,
    c.name,
    bi.planned_amount,
    COALESCE(c.parent_id, bi.category_id) AS group_id
  FROM budgets b
  JOIN budget_items bi ON bi.budget_id = b.id
  JOIN categories c    ON c.id = bi.category_id
  LEFT JOIN categories pc ON pc.id = c.parent_id
  WHERE b.year = p_year AND b.month IS NOT NULL
    AND (p_type IS NULL OR c.type = p_type)
    AND (p_expense_kind IS NULL OR COALESCE(pc.expense_kind, c.expense_kind) = p_expense_kind)
),
effective AS (
  -- 소분류 항목이 있는 (그룹, 월)에서는 대분류 자신의 항목 제외 (budget_totals_v와 동일 규칙)
  SELECT r.*
  FROM grid_rows r
  WHERE r.parent_id IS NOT NULL
     OR NOT EXISTS (
       SELECT 1 FROM grid_rows rc
       WHERE rc.group_id = r.group_id AND rc.month = r.month AND rc.parent_id IS NOT NULL
     )
),
group_month AS (
  SELECT group_id, month, SUM(planned_amount)::bigint AS amount
  FROM effective
  GROUP BY group_id, month
),
category_month AS (
  SELECT category_id, group_id, month, SUM(planned_amount)::bigint AS amount
  FROM grid_rows
  GROUP BY category_id, group_id, month
),
month_totals AS (
  SELECT m AS month, COALESCE((
    SELECT SUM(gm.amount) FROM group_month gm WHERE gm.month = m), 0)::bigint AS amount
  FROM generate_series(1, 12) m
),
grid_groups AS (
  SELECT DISTINCT r.group_id FROM grid_rows r
)
SELECT jsonb_build_object(
  'groups', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'categoryId', g.group_id,
      'categoryName', gc.name,
      'type', gc.type,
      'expenseKind', gc.expense_kind,
      'months', (
        SELECT jsonb_agg(COALESCE(gm.amount, 0) ORDER BY m)
        FROM generate_series(1, 12) m
        LEFT JOIN group_month gm ON gm.group_id = g.group_id AND gm.month = m),
      'total', COALESCE((
        SELECT SUM(gm.amount) FROM group_month gm WHERE gm.group_id = g.group_id), 0),
      'categories', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'categoryId', mc.category_id,
          'categoryName', mcc.name,
          'parentId', mcc.parent_id,
          'months', (
            SELECT jsonb_agg(COALESCE(cm.amount, 0) ORDER BY m)
            FROM generate_series(1, 12) m
            LEFT JOIN category_month cm
              ON cm.category_id = mc.category_id AND cm.month = m),
          'total', mc.total) ORDER BY mcc.parent_id NULLS FIRST, mcc.sort_order, mcc.name)
        FROM (
          SELECT cm.category_id, SUM(cm.amount)::bigint AS total
          FROM category_month cm
          WHERE cm.group_id = g.group_id
          GROUP BY cm.category_id
        ) mc
        JOIN categories mcc ON mcc.id = mc.category_id), '[]'::jsonb))
      ORDER BY gc.type, gc.sort_order, gc.name)
    FROM grid_groups g
    JOIN categories gc ON gc.id = g.group_id), '[]'::jsonb),
  'monthlyTotals', (SELECT jsonb_agg(mt.amount ORDER BY mt.month) FROM month_totals mt),
  'grandTotal', COALESCE((SELECT SUM(gm.amount) FROM group_month gm), 0));
$$;

-- 3.7 get_budget_summary(p_year) → jsonb (연간 개요 차트, API.md §6.10)
CREATE OR REPLACE FUNCTION public.get_budget_summary(p_year integer)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
WITH planned AS (
  SELECT b.month, v.total_income, v.total_expense
  FROM budgets b
  JOIN budget_totals_v v ON v.budget_id = b.id
  WHERE b.year = p_year AND b.month IS NOT NULL
),
actual AS (
  SELECT
    EXTRACT(MONTH FROM t.date)::integer AS month,
    COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'income'),  0)::bigint AS income,
    COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'expense'), 0)::bigint AS expense
  FROM transactions t
  WHERE t.date >= make_date(p_year, 1, 1)
    AND t.date <  make_date(p_year + 1, 1, 1)
    AND t.type IN ('income', 'expense')
    AND t.status = 'applied'
  GROUP BY 1
)
SELECT jsonb_build_object('months', jsonb_agg(jsonb_build_object(
  'month', m,
  'plannedIncome',  COALESCE(p.total_income, 0),
  'plannedExpense', COALESCE(p.total_expense, 0),
  'actualIncome',   COALESCE(a.income, 0),
  'actualExpense',  COALESCE(a.expense, 0)) ORDER BY m))
FROM generate_series(1, 12) m
LEFT JOIN planned p ON p.month = m
LEFT JOIN actual  a ON a.month = m;
$$;

-- ============================================================
-- 4. 인덱스 (DB.md §4)
--    uq_budgets_year_month / uq_budget_items_budget_category 인덱스는 제약이 자동 생성.
-- ============================================================

CREATE INDEX idx_budgets_year             ON public.budgets (year);
-- idx_budget_items_budget_id 생략(리뷰 M3): uq_budget_items_budget_category 인덱스가
-- budget_id 선두 컬럼으로 동일 스캔을 커버한다 (DB.md §4 목록 대비 의도적 축소).
CREATE INDEX idx_budget_items_category_id ON public.budget_items (category_id);

-- ============================================================
-- 5. RLS (DB.md §5) — anon 완전 차단 + authenticated 소유자 이메일 검증
--    (phase1_transaction_core.sql §5와 동일 정책 형태)
-- ============================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['budgets', 'budget_items'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I_owner_all ON public.%I
         FOR ALL TO authenticated
         USING (auth.jwt()->>''email'' = current_setting(''app.owner_email'', true))
         WITH CHECK (auth.jwt()->>''email'' = current_setting(''app.owner_email'', true))', t, t);
  END LOOP;
END $$;

-- Supabase 로컬/호스팅은 ALTER DEFAULT PRIVILEGES로 신규 함수에 anon EXECUTE를
-- 기본 부여하므로, 이 마이그레이션의 신규 함수 전부에서 다시 회수한다(fail-closed).
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, public;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.budgets, public.budget_items
  TO authenticated;
GRANT SELECT ON public.budget_totals_v TO authenticated;

-- budget_json은 SECURITY INVOKER RPC 내부에서 호출되므로 authenticated에도 EXECUTE 필요
GRANT EXECUTE ON FUNCTION
  public.budget_json(uuid),
  public.create_budget(jsonb),
  public.update_budget(uuid, jsonb),
  public.copy_budget(integer, integer, integer, integer),
  public.upsert_budget_cell(integer, integer, uuid, bigint),
  public.get_budget_actuals(integer, integer),
  public.get_annual_grid(integer, text, text),
  public.get_budget_summary(integer)
TO authenticated;
