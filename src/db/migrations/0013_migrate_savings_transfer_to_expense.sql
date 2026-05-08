-- 저축성 이체(transfer)를 저축성 지출(expense + expenseKind='saving')로 변환
--
-- 휴리스틱: type='transfer'이면서 to_account_id가 savings 또는 investment 타입의
-- 계좌인 거래를, expense + 적절한 저축 카테고리로 변환한다.
--
-- 카테고리 매핑 (도착 계좌 type + deposit_type 기준):
--   savings + installment          → '적금'
--   savings + lump_sum (또는 NULL) → '예금'
--   investment                      → '주식'
--
-- 매칭 카테고리가 시드되지 않은 환경에서는 기존 category_id를 유지하여 안전성 확보.
-- 이미 변환되어 type='expense'인 행은 WHERE 조건에 의해 다시 처리되지 않음 (idempotent).

UPDATE transactions t
SET
  type = 'expense',
  category_id = COALESCE(
    t.category_id,
    (
      SELECT c.id
      FROM categories c
      JOIN accounts a ON a.id = t.to_account_id
      WHERE c.type = 'expense'
        AND c.expense_kind = 'saving'
        AND c.parent_id IS NOT NULL
        AND (
          (a.type = 'savings' AND a.deposit_type = 'installment' AND c.name = '적금')
          OR (a.type = 'savings' AND (a.deposit_type = 'lump_sum' OR a.deposit_type IS NULL) AND c.name = '예금')
          OR (a.type = 'investment' AND c.name = '주식')
        )
      LIMIT 1
    )
  )
WHERE t.type = 'transfer'
  AND t.to_account_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM accounts a
    WHERE a.id = t.to_account_id
      AND a.type IN ('savings', 'investment')
  );
