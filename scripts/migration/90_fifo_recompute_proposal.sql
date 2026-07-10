-- 90_fifo_recompute_proposal.sql — 알지노믹스 FIFO 드리프트 보정안 (사용자 채택 결정 후 실행)
--
-- 배경 (리허설 대사 §3.4 FAIL — docs/migration/rehearsal-report.md 참조):
--   구 앱에서 2026-04-21 알지노믹스 2주 매도 시 FIFO 로트 매칭이 실행되지 않았다.
--   증거: (a) 매도 행 자체에 remaining_quantity=2 가 저장됨(매도 행에는 잔여 개념이 없음 — 오염),
--         (b) 대응 매수 로트(2026-04-20, 2주 @215,000)의 remaining_quantity 가 2 로 남음,
--         (c) 매도의 realized_gain=0 (매칭 미실행).
--   결과: 전량 매도된 종목에 잔여 2주가 남는 불변식 위반(Σ잔여 2 ≠ Σ매수 9 − Σ매도 9 = 0).
--
-- FIFO 재계산 (수기 검증 — 대상 종목 매매는 총 4건):
--   buy 7 @215,500 (4/20) → sell 7 @217,500 (4/20): 소진, realized +14,000 (legacy 값 정상)
--   buy 2 @215,000 (4/20) → sell 2 @186,300 (4/21): 소진되어야 함
--     → 매수 로트 remaining 2 → 0
--     → 매도 realized_gain = 372,600(수령) − 430,000(원가) = −57,400
--
-- 멱등: WHERE 조건이 보정 전 상태에만 매칭 — 재실행 시 0행 갱신.
-- 주의: transform.sql 재실행(ON CONFLICT DO NOTHING)은 본 보정을 되돌리지 않는다.
--       되돌리려면 public 데이터 TRUNCATE 후 transform.sql 재적재.
\set ON_ERROR_STOP on

\ir 00_to_uuid.sql

BEGIN;

-- 1) 매수 로트(2026-04-20, 2주) 잔여 소진
UPDATE public.investment_trades
SET remaining_quantity = 0
WHERE id = legacy.to_uuid('1ixJh98FwwHlSitpuyazl')
  AND trade_type = 'buy'
  AND remaining_quantity = 2;

-- 2) 매도(2026-04-21, 2주) 실현손익 재계산 반영
UPDATE public.investment_trades
SET realized_gain = -57400
WHERE id = legacy.to_uuid('rRReVqnZWBJRgiRT7x9xt')
  AND trade_type = 'sell'
  AND realized_gain = 0;

COMMIT;

-- 검증: 불변식 위반 0행이어야 함
SELECT ticker,
       COALESCE(SUM(quantity)           FILTER (WHERE trade_type = 'buy'),  0) AS bought,
       COALESCE(SUM(quantity)           FILTER (WHERE trade_type = 'sell'), 0) AS sold,
       COALESCE(SUM(remaining_quantity) FILTER (WHERE trade_type = 'buy'),  0) AS remaining
FROM public.investment_trades
GROUP BY asset_id, ticker
HAVING COALESCE(SUM(remaining_quantity) FILTER (WHERE trade_type = 'buy'), 0)
    <> COALESCE(SUM(quantity) FILTER (WHERE trade_type = 'buy'),  0)
     - COALESCE(SUM(quantity) FILTER (WHERE trade_type = 'sell'), 0);
