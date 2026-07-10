-- Phase 2C: 자산·투자 트랙 — asset_categories / assets / asset_valuations / investment_trades
-- + accounts.asset_id FK 후행 부착 + 뷰 3종 + account_balances_v 투자 분기 활성화
-- + create/delete_investment_trade(FIFO, SECURITY DEFINER) + get_investment_summary
-- + snapshot_asset_valuations + pg_cron + 인덱스 + RLS
-- 스펙: docs/DB.md §1.6, §1.9, §2.1-2.3, §2.5, §3.4-3.5, §3.8, §3.13, §4, §5, §6
--
-- RAISE ERRCODE 규약 (docs/DB.md §3 SEC-L2 확장 — src/server/api-errors.ts와 1:1):
--   CF400 = 잘못된 입력            → 400 VALIDATION_ERROR
--   CF423 = 보유수량 부족           → 422 INSUFFICIENT_HOLDINGS
--   CF409 = 매칭 로트 삭제 금지 가드 → 409 TRADE_HAS_DEPENDENTS

-- ============================================================
-- 1. 테이블 (DB.md §1.6, §1.9)
-- ============================================================

-- 1.1 asset_categories
CREATE TABLE public.asset_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  kind       text NOT NULL CHECK (kind IN ('financial','non_financial')),
  icon       text,
  color      text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_asset_categories_updated_at
  BEFORE UPDATE ON public.asset_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 1.2 assets (current_value 저장 컬럼 없음 — asset_values_v 파생)
CREATE TABLE public.assets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  asset_category_id uuid NOT NULL REFERENCES public.asset_categories(id),
  acquisition_date  date NOT NULL,
  acquisition_cost  bigint NOT NULL CHECK (acquisition_cost >= 0),
  institution       text,
  memo              text,
  is_active         boolean NOT NULL DEFAULT true,
  metadata          jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_assets_updated_at
  BEFORE UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 1.3 asset_valuations
CREATE TABLE public.asset_valuations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id   uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  date       date NOT NULL,
  value      bigint NOT NULL,
  source     text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','api','estimate','auto')),
  memo       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_asset_valuations_asset_date UNIQUE (asset_id, date)
);

CREATE TRIGGER trg_asset_valuations_updated_at
  BEFORE UPDATE ON public.asset_valuations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 1.4 investment_trades (파생 저장 예외 2컬럼: remaining_quantity / realized_gain)
CREATE TABLE public.investment_trades (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id           uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  trade_type         text NOT NULL CHECK (trade_type IN ('buy','sell','dividend')),
  date               date NOT NULL,
  ticker             text,
  quantity           numeric(20,8) NOT NULL CHECK (quantity > 0),
  unit_price         bigint NOT NULL CHECK (unit_price >= 0),
  total_amount       bigint NOT NULL CHECK (total_amount >= 0),
  fee                bigint NOT NULL DEFAULT 0 CHECK (fee >= 0),
  tax                bigint NOT NULL DEFAULT 0 CHECK (tax >= 0),
  net_amount         bigint NOT NULL,
  memo               text,
  account_id         uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  -- ▼ 파생 저장 예외 2컬럼: RPC(create/delete_investment_trade) 내부에서만 변경
  remaining_quantity numeric(20,8) NOT NULL DEFAULT 0
                     CHECK (remaining_quantity >= 0),
  realized_gain      bigint NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_trades_remaining_le_qty    CHECK (remaining_quantity <= quantity),
  CONSTRAINT chk_trades_gain_sell_only      CHECK (trade_type = 'sell' OR realized_gain = 0),
  CONSTRAINT chk_trades_remaining_buy_only  CHECK (trade_type = 'buy' OR remaining_quantity = 0)
);

CREATE TRIGGER trg_investment_trades_updated_at
  BEFORE UPDATE ON public.investment_trades
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 1.5 accounts.asset_id FK 후행 부착 (Phase 1a 20260710120000 §1.2 주석의 약속 이행)
ALTER TABLE public.accounts
  ADD CONSTRAINT fk_accounts_asset_id
  FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE SET NULL;

-- ============================================================
-- 2. 인덱스 (DB.md §4)
-- ============================================================

CREATE INDEX idx_assets_asset_category_id ON public.assets (asset_category_id);
CREATE INDEX idx_assets_is_active         ON public.assets (is_active);
-- 최신 평가 DISTINCT ON 최적화
CREATE INDEX idx_asset_valuations_asset_date ON public.asset_valuations (asset_id, date DESC);
CREATE INDEX idx_asset_valuations_date       ON public.asset_valuations (date);

CREATE INDEX idx_trades_asset_date ON public.investment_trades (asset_id, date);
CREATE INDEX idx_trades_account_id ON public.investment_trades (account_id) WHERE account_id IS NOT NULL;
CREATE INDEX idx_trades_date       ON public.investment_trades (date);
-- FIFO 열린 로트 부분 인덱스: create_investment_trade 의 단일 문장 FOR UPDATE 잠금 스캔 최적화
-- (잠금·FIFO 정렬 키 (date, id) 와 일치)
CREATE INDEX idx_trades_open_lots  ON public.investment_trades (asset_id, ticker, date, id)
  WHERE trade_type = 'buy' AND remaining_quantity > 0;
-- 역FIFO(차감된 로트) 스캔 — 잠금은 (date, id ASC), 복원 적용은 메모리에서 date DESC
CREATE INDEX idx_trades_consumed_lots ON public.investment_trades (asset_id, ticker, date, id)
  WHERE trade_type = 'buy';

-- ============================================================
-- 3. 뷰 (DB.md §2)
-- ============================================================

-- 3.1 account_balances_v — 투자 매매 분기 활성화 (CREATE OR REPLACE, DB.md §2.1 전체 정의)
--     잔액 = initial_balance + Σ(적용된 거래 효과) + Σ(투자 매매의 계좌 효과)
CREATE OR REPLACE VIEW public.account_balances_v
WITH (security_invoker = on) AS
SELECT
  a.id          AS account_id,
  a.name,
  a.type,
  a.is_active,
  a.initial_balance,
  (a.initial_balance
   + COALESCE(tx.net_effect, 0)
   + COALESCE(tr.net_effect, 0))::bigint AS current_balance
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
) tx ON tx.account_id = a.id
LEFT JOIN (
  -- 투자 매매의 계좌 효과: buy −total_amount, sell/dividend +net_amount
  SELECT account_id,
         SUM(CASE WHEN trade_type = 'buy' THEN -total_amount
                  ELSE net_amount END)::bigint AS net_effect
  FROM public.investment_trades
  WHERE account_id IS NOT NULL
  GROUP BY account_id
) tr ON tr.account_id = a.id;

-- 3.2 open_lots_v — 열린 FIFO 로트 (DB.md §2.2)
CREATE OR REPLACE VIEW public.open_lots_v
WITH (security_invoker = on) AS
SELECT
  id AS trade_id,
  asset_id,
  ticker,
  date,
  created_at,
  quantity,
  remaining_quantity,
  unit_price,
  (unit_price * remaining_quantity)::bigint AS remaining_cost
FROM public.investment_trades
WHERE trade_type = 'buy' AND remaining_quantity > 0;

-- 3.3 asset_values_v — 자산 현재가치 (DB.md §2.3, 구 syncAssetFromAccount 이식)
--     연결 계좌/보유 로트 있음 → Σ계좌 잔액 + Σ(단가×잔여수량) / 없음 → 최신 평가액, 없으면 취득원가
CREATE OR REPLACE VIEW public.asset_values_v
WITH (security_invoker = on) AS
WITH linked AS (
  SELECT ac.asset_id,
         SUM(ab.current_balance)::bigint AS balance_sum,
         COUNT(*) AS account_cnt
  FROM public.accounts ac
  JOIN public.account_balances_v ab ON ab.account_id = ac.id
  WHERE ac.asset_id IS NOT NULL
  GROUP BY ac.asset_id
),
holdings AS (
  SELECT asset_id, SUM(remaining_cost)::bigint AS holding_value
  FROM public.open_lots_v
  GROUP BY asset_id
),
latest_val AS (
  SELECT DISTINCT ON (asset_id) asset_id, value
  FROM public.asset_valuations
  ORDER BY asset_id, date DESC
)
SELECT
  s.id AS asset_id,
  s.name,
  s.asset_category_id,
  s.is_active,
  s.acquisition_cost,
  CASE
    WHEN l.account_cnt IS NOT NULL OR h.holding_value IS NOT NULL
      THEN COALESCE(l.balance_sum, 0) + COALESCE(h.holding_value, 0)
    ELSE COALESCE(lv.value, s.acquisition_cost)
  END::bigint AS current_value
FROM public.assets s
LEFT JOIN linked     l  ON l.asset_id  = s.id
LEFT JOIN holdings   h  ON h.asset_id  = s.id
LEFT JOIN latest_val lv ON lv.asset_id = s.id;

-- 3.4 monthly_investment_summary_v — investment_returns 대체 (DB.md §2.5)
CREATE OR REPLACE VIEW public.monthly_investment_summary_v
WITH (security_invoker = on) AS
SELECT
  asset_id,
  EXTRACT(YEAR  FROM date)::integer AS year,
  EXTRACT(MONTH FROM date)::integer AS month,
  COALESCE(SUM(total_amount)  FILTER (WHERE trade_type = 'buy'),      0)::bigint AS invested_amount,
  COALESCE(SUM(net_amount)    FILTER (WHERE trade_type = 'sell'),     0)::bigint AS sold_amount,
  COALESCE(SUM(net_amount)    FILTER (WHERE trade_type = 'dividend'), 0)::bigint AS dividend_income,
  COALESCE(SUM(realized_gain) FILTER (WHERE trade_type = 'sell'),     0)::bigint AS realized_gain
FROM public.investment_trades
GROUP BY asset_id, EXTRACT(YEAR FROM date), EXTRACT(MONTH FROM date);

-- ============================================================
-- 4. RPC (DB.md §3.4-3.5, §3.8, §3.13)
-- ============================================================

-- 4.1 create_investment_trade — FIFO 차감 + realized_gain (SECURITY DEFINER)
--     TS 레퍼런스(src/lib/calculations/fifo.ts matchSellToLots/applyTrade)와
--     property-based 교차 검증 대상. 정렬 키 (date, id)·round(half away from zero) 동일.
CREATE OR REPLACE FUNCTION public.create_investment_trade(p jsonb)
RETURNS public.investment_trades
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row        public.investment_trades;
  v_lot        record;
  v_remaining  numeric;
  v_matched    numeric;
  v_total_cost numeric := 0;
BEGIN
  -- [SECURITY DEFINER] 함수 로직이 유일한 FIFO 무결성 통제 — 입력 검증을 서두에 집중한다
  IF (p->>'trade_type') NOT IN ('buy','sell','dividend') THEN
    RAISE EXCEPTION '잘못된 trade_type: %', p->>'trade_type' USING ERRCODE = 'CF400';
  END IF;
  IF COALESCE((p->>'quantity')::numeric, 0) <= 0
     OR COALESCE((p->>'unit_price')::bigint, -1) < 0
     OR COALESCE((p->>'total_amount')::bigint, -1) < 0
     OR COALESCE((p->>'fee')::bigint, 0) < 0
     OR COALESCE((p->>'tax')::bigint, 0) < 0
     OR COALESCE((p->>'net_amount')::bigint, -1) < 0 THEN
    RAISE EXCEPTION '잘못된 수량/금액 입력입니다' USING ERRCODE = 'CF400';
  END IF;

  INSERT INTO investment_trades (
    asset_id, trade_type, date, ticker, quantity, unit_price,
    total_amount, fee, tax, net_amount, memo, account_id,
    remaining_quantity, realized_gain
  ) VALUES (
    (p->>'asset_id')::uuid,
    p->>'trade_type',
    (p->>'date')::date,
    NULLIF(p->>'ticker',''),
    (p->>'quantity')::numeric,
    (p->>'unit_price')::bigint,
    (p->>'total_amount')::bigint,
    COALESCE((p->>'fee')::bigint, 0),
    COALESCE((p->>'tax')::bigint, 0),
    (p->>'net_amount')::bigint,
    p->>'memo',
    NULLIF(p->>'account_id','')::uuid,
    CASE WHEN p->>'trade_type' = 'buy' THEN (p->>'quantity')::numeric ELSE 0 END,
    0
  )
  RETURNING * INTO v_row;

  IF v_row.trade_type = 'sell' THEN
    v_remaining := v_row.quantity;

    -- [잠금 순서 통일] 대상 로트 전체를 단일 문장 SELECT ... ORDER BY date, id FOR UPDATE 로
    -- 먼저 잠근 후 갱신한다. delete_investment_trade와 동일한 (date, id) 오름차순
    -- 잠금 순서를 사용해 교차 실행 시 데드락 가능성을 제거한다.
    -- 트레이드오프: 동일 자산 동시 매도는 직렬화됨 — 단일 사용자 앱이라 허용.
    PERFORM 1
    FROM investment_trades
    WHERE asset_id = v_row.asset_id
      AND trade_type = 'buy'
      AND remaining_quantity > 0
      AND (ticker = v_row.ticker OR (ticker IS NULL AND v_row.ticker IS NULL))
    ORDER BY date, id
    FOR UPDATE;

    -- FIFO 차감: 잠금 완료 후 시간순(date, id ASC)으로 갱신 (추가 잠금 없음)
    FOR v_lot IN
      SELECT id, unit_price, remaining_quantity
      FROM investment_trades
      WHERE asset_id = v_row.asset_id
        AND trade_type = 'buy'
        AND remaining_quantity > 0
        AND (ticker = v_row.ticker OR (ticker IS NULL AND v_row.ticker IS NULL))
      ORDER BY date ASC, id ASC
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_matched    := LEAST(v_lot.remaining_quantity, v_remaining);
      v_total_cost := v_total_cost + v_matched * v_lot.unit_price;

      UPDATE investment_trades
      SET remaining_quantity = remaining_quantity - v_matched
      WHERE id = v_lot.id;

      v_remaining := v_remaining - v_matched;
    END LOOP;

    IF v_remaining > 0 THEN
      -- 함수 전체가 롤백되므로 INSERT·로트 차감 모두 원복
      RAISE EXCEPTION '보유수량 부족: 매도 수량이 매수 잔여 수량을 초과합니다'
        USING ERRCODE = 'CF423';
    END IF;

    -- 실현손익 = 매도 수령액(net) − 매칭된 매수 원가 (PG round = half away from zero)
    UPDATE investment_trades
    SET realized_gain = round(v_row.net_amount - v_total_cost)::bigint
    WHERE id = v_row.id
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END $$;

-- 4.2 delete_investment_trade — 역FIFO 복원 + 매칭 로트 삭제 금지 가드 (SECURITY DEFINER)
--     역FIFO는 원 매칭 기록이 없으므로 근사 복원(레거시 reverseLotMatching과 동일한 알려진 한계).
CREATE OR REPLACE FUNCTION public.delete_investment_trade(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row     public.investment_trades;
  v_lot     record;
  v_restore numeric;
  v_r       numeric;
BEGIN
  -- [SECURITY DEFINER] 검증(대상 존재·삭제 가드)을 서두에 집중
  SELECT * INTO v_row FROM investment_trades WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  -- [가드] 일부 매도에 매칭된 buy 로트 삭제 금지(FIFO 무결성 보호)
  IF v_row.trade_type = 'buy' AND v_row.remaining_quantity < v_row.quantity THEN
    RAISE EXCEPTION '이미 일부 매도에 매칭된 매수 기록은 삭제할 수 없습니다. 매도 기록을 먼저 삭제하세요'
      USING ERRCODE = 'CF409';
  END IF;

  IF v_row.trade_type = 'sell' THEN
    -- [잠금 순서 통일] create_investment_trade와 동일하게 대상 로트 전체를
    -- 단일 문장 SELECT ... ORDER BY date, id FOR UPDATE 로 먼저 잠근다(데드락 제거).
    -- 역FIFO 적용 순서는 잠금 후 메모리에서 date DESC 로 처리한다.
    PERFORM 1
    FROM investment_trades
    WHERE asset_id = v_row.asset_id
      AND trade_type = 'buy'
      AND quantity > remaining_quantity
      AND (ticker = v_row.ticker OR (ticker IS NULL AND v_row.ticker IS NULL))
    ORDER BY date, id
    FOR UPDATE;

    -- 역FIFO: 가장 최근에 차감된 로트(quantity > remaining)부터 복원 (잠금 완료 후)
    v_restore := v_row.quantity;
    FOR v_lot IN
      SELECT id, quantity, remaining_quantity
      FROM investment_trades
      WHERE asset_id = v_row.asset_id
        AND trade_type = 'buy'
        AND quantity > remaining_quantity
        AND (ticker = v_row.ticker OR (ticker IS NULL AND v_row.ticker IS NULL))
      ORDER BY date DESC, id DESC
    LOOP
      EXIT WHEN v_restore <= 0;
      v_r := LEAST(v_lot.quantity - v_lot.remaining_quantity, v_restore);
      UPDATE investment_trades
      SET remaining_quantity = remaining_quantity + v_r
      WHERE id = v_lot.id;
      v_restore := v_restore - v_r;
    END LOOP;
  END IF;

  DELETE FROM investment_trades WHERE id = p_id;
  RETURN true;
END $$;

-- 4.3 get_investment_summary — 투자 수익 요약 1왕복 (DB.md §3.13, API.md §11.6)
--     모든 매매 기록을 누락 없이 집계한다(커밋 76da628 회귀 방지).
CREATE OR REPLACE FUNCTION public.get_investment_summary(
  p_scope text,
  p_year  integer DEFAULT NULL,
  p_month integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_from   date;
  v_to     date; -- exclusive
  v_result jsonb;
BEGIN
  IF p_scope = 'all' THEN
    v_from := NULL;
    v_to   := NULL;
  ELSIF p_scope = 'year' THEN
    IF p_year IS NULL THEN
      RAISE EXCEPTION 'scope=year에는 p_year가 필요합니다' USING ERRCODE = 'CF400';
    END IF;
    v_from := make_date(p_year, 1, 1);
    v_to   := (v_from + interval '1 year')::date;
  ELSIF p_scope = 'month' THEN
    IF p_year IS NULL OR p_month IS NULL THEN
      RAISE EXCEPTION 'scope=month에는 p_year/p_month가 필요합니다' USING ERRCODE = 'CF400';
    END IF;
    v_from := make_date(p_year, p_month, 1);
    v_to   := (v_from + interval '1 month')::date;
  ELSE
    RAISE EXCEPTION '잘못된 scope: %', p_scope USING ERRCODE = 'CF400';
  END IF;

  WITH per_asset AS (
    SELECT t.asset_id, t.ticker,
           COALESCE(SUM(t.total_amount)  FILTER (WHERE t.trade_type = 'buy'),      0)::bigint AS total_buy,
           COALESCE(SUM(t.net_amount)    FILTER (WHERE t.trade_type = 'sell'),     0)::bigint AS total_sell,
           COALESCE(SUM(t.net_amount)    FILTER (WHERE t.trade_type = 'dividend'), 0)::bigint AS dividend_income,
           COALESCE(SUM(t.realized_gain) FILTER (WHERE t.trade_type = 'sell'),     0)::bigint AS realized_gain,
           COALESCE(SUM(t.fee), 0)::bigint AS fee_total,
           COALESCE(SUM(t.tax), 0)::bigint AS tax_total
    FROM investment_trades t
    WHERE v_from IS NULL OR (t.date >= v_from AND t.date < v_to)
    GROUP BY t.asset_id, t.ticker
  ),
  holdings AS (
    SELECT asset_id, ticker,
           SUM(remaining_quantity) AS holding_qty,
           SUM(remaining_cost)::bigint AS holding_cost
    FROM open_lots_v
    GROUP BY asset_id, ticker
  ),
  enriched AS (
    SELECT pa.*,
           COALESCE(h.holding_qty, 0) AS holding_qty,
           CASE WHEN COALESCE(h.holding_qty, 0) > 0
                THEN round(h.holding_cost / h.holding_qty)::bigint
                ELSE 0 END AS avg_buy_price,
           round((pa.realized_gain + pa.dividend_income)::numeric
                 / NULLIF(pa.total_buy, 0) * 100, 2) AS return_rate
    FROM per_asset pa
    LEFT JOIN holdings h ON h.asset_id = pa.asset_id
                        AND (h.ticker = pa.ticker OR (h.ticker IS NULL AND pa.ticker IS NULL))
  )
  SELECT jsonb_build_object(
    'total', jsonb_build_object(
      'total_buy',       COALESCE(SUM(e.total_buy), 0),
      'total_sell',      COALESCE(SUM(e.total_sell), 0),
      'realized_gain',   COALESCE(SUM(e.realized_gain), 0),
      'dividend_income', COALESCE(SUM(e.dividend_income), 0),
      'fee_total',       COALESCE(SUM(e.fee_total), 0),
      'tax_total',       COALESCE(SUM(e.tax_total), 0),
      'net_profit',      COALESCE(SUM(e.realized_gain) + SUM(e.dividend_income), 0),
      'return_rate',     COALESCE(round((SUM(e.realized_gain) + SUM(e.dividend_income))::numeric
                                        / NULLIF(SUM(e.total_buy), 0) * 100, 2), 0)
    ),
    'assets', COALESCE(jsonb_agg(
      jsonb_build_object(
        'asset_id',        e.asset_id,
        'ticker',          e.ticker,
        'total_buy',       e.total_buy,
        'total_sell',      e.total_sell,
        'dividend_income', e.dividend_income,
        'realized_gain',   e.realized_gain,
        'fee_total',       e.fee_total,
        'tax_total',       e.tax_total,
        'return_rate',     COALESCE(e.return_rate, 0),
        'holding_qty',     e.holding_qty,
        'avg_buy_price',   e.avg_buy_price
      ) ORDER BY e.total_buy DESC
    ) FILTER (WHERE e.asset_id IS NOT NULL), '[]'::jsonb)
  )
  INTO v_result
  FROM enriched e;

  RETURN v_result;
END $$;

-- 4.4 snapshot_asset_valuations — 일일 자산 평가 스냅샷 (DB.md §3.8)
--     manual(수동 입력)만 보존, auto/estimate는 자동값으로 대체(의도된 동작).
CREATE OR REPLACE FUNCTION public.snapshot_asset_valuations(
  p_date date DEFAULT (now() AT TIME ZONE 'Asia/Seoul')::date
) RETURNS integer
LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  WITH ins AS (
    INSERT INTO asset_valuations (asset_id, date, value, source)
    SELECT av.asset_id, p_date, av.current_value, 'auto'
    FROM asset_values_v av
    JOIN assets a ON a.id = av.asset_id AND a.is_active
    ON CONFLICT (asset_id, date)
    DO UPDATE SET value = EXCLUDED.value, source = 'auto'
    WHERE asset_valuations.source IN ('auto', 'estimate')  -- 수동 입력은 덮어쓰지 않음
    RETURNING 1
  )
  SELECT count(*)::integer FROM ins;
$$;

-- ============================================================
-- 5. RLS + 권한 (DB.md §5)
-- ============================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'asset_categories','assets','asset_valuations','investment_trades'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I_owner_all ON public.%I
         FOR ALL TO authenticated
         USING (auth.jwt()->>''email'' = current_setting(''app.owner_email'', true))
         WITH CHECK (auth.jwt()->>''email'' = current_setting(''app.owner_email'', true))', t, t);
  END LOOP;
END $$;

-- authenticated: 테이블/뷰 접근 + RPC 실행 (RLS 정책이 소유자 검증 담당)
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.asset_categories, public.assets, public.asset_valuations
  TO authenticated;
GRANT SELECT
  ON public.open_lots_v, public.asset_values_v, public.monthly_investment_summary_v
  TO authenticated;
GRANT EXECUTE ON FUNCTION
  public.create_investment_trade(jsonb),
  public.delete_investment_trade(uuid),
  public.get_investment_summary(text, integer, integer),
  public.snapshot_asset_valuations(date)
TO authenticated;

-- FIFO 상태 컬럼 이중 방어(DB.md §5 취지): 테이블 전체 UPDATE를 부여하면
-- 컬럼 REVOKE가 무력화되므로(PG 권한 모델: 테이블 권한 ⊃ 컬럼 권한),
-- UPDATE는 허용 컬럼만 열거해 컬럼 단위로 부여한다.
-- remaining_quantity/realized_gain 변경은 SECURITY DEFINER RPC
-- (create/delete_investment_trade) 로직만이 유일한 통제 경로다.
GRANT SELECT, INSERT, DELETE ON public.investment_trades TO authenticated;
GRANT UPDATE (asset_id, trade_type, date, ticker, quantity, unit_price,
              total_amount, fee, tax, net_amount, memo, account_id)
  ON public.investment_trades TO authenticated;

-- ============================================================
-- 6. pg_cron — 일일 자산 평가 스냅샷 (DB.md §6)
--    로컬 Supabase에는 pg_cron이 없을 수 있어 DO 블록으로 예외 처리한다.
-- ============================================================

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  -- 매일 00:10 KST (= 15:10 UTC): process_due(00:05) 이후 실행되도록 5분 간격
  PERFORM cron.schedule(
    'snapshot-asset-valuations',
    '10 15 * * *',
    $job$SELECT public.snapshot_asset_valuations()$job$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron 사용 불가(로컬 등) — snapshot-asset-valuations 잡 등록 생략: %', SQLERRM;
END $$;
