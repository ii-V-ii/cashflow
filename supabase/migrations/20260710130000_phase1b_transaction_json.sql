-- Phase 1b: transaction_json(p_id) — Transaction DTO(API.md §2.1)를 jsonb로 완성하는 헬퍼.
-- create/update_transaction과 같은 문장에서 호출해도 태그·조인이 보이도록 VOLATILE로 선언한다
-- (VOLATILE 함수는 내부 쿼리마다 새 스냅샷을 얻어 같은 문장 안의 선행 쓰기를 볼 수 있다).
-- 사용: SELECT public.transaction_json((public.create_transaction($1)).id) — 총 1왕복 유지.

CREATE OR REPLACE FUNCTION public.transaction_json(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', t.id,
    'type', t.type,
    'amount', t.amount,
    'description', t.description,
    'date', to_char(t.date, 'YYYY-MM-DD'),
    'categoryId', t.category_id,
    'category', CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', c.id, 'name', c.name, 'icon', c.icon, 'color', c.color,
      'expenseKind', c.expense_kind) END,
    'accountId', t.account_id,
    'account', jsonb_build_object('id', a.id, 'name', a.name, 'type', a.type),
    'toAccountId', t.to_account_id,
    'toAccount', CASE WHEN ta.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', ta.id, 'name', ta.name, 'type', ta.type) END,
    'memo', t.memo,
    'tags', tg.tags,
    'installmentMonths', t.installment_months,
    'installmentCurrent', t.installment_current,
    'status', t.status,
    'recurringId', t.recurring_id,
    'createdAt', t.created_at,
    'updatedAt', t.updated_at
  )
  INTO v_result
  FROM transactions t
  JOIN accounts a ON a.id = t.account_id
  LEFT JOIN categories c ON c.id = t.category_id
  LEFT JOIN accounts ta ON ta.id = t.to_account_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(
      jsonb_agg(jsonb_build_object('id', tag.id, 'name', tag.name, 'color', tag.color)
                ORDER BY tag.name),
      '[]'::jsonb) AS tags
    FROM transaction_tags tt
    JOIN tags tag ON tag.id = tt.tag_id
    WHERE tt.transaction_id = t.id
  ) tg ON true
  WHERE t.id = p_id;

  RETURN v_result;  -- 없으면 NULL (호출부에서 404 처리)
END $$;

-- 신규 함수는 PUBLIC EXECUTE가 기본 부여되므로 명시적으로 차단 후 authenticated에만 허용
REVOKE ALL ON FUNCTION public.transaction_json(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transaction_json(uuid) TO authenticated;
