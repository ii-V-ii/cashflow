# Cashflow v2 — DB 설계서

> 재구축 계획(curious-orbiting-rocket)의 "목표 아키텍처" 확정 설계를 구체화한 문서.
> **설계 제1원칙: 파생 상태를 저장하지 않는다.** 잔액·자산가치·예산합계는 전부 뷰/함수로 계산한다.
> 유일한 예외는 FIFO 로트 상태(`investment_trades.remaining_quantity`, `realized_gain`)이며, 이 두 컬럼은 **RPC 내부에서만** 변경한다.

## 공통 규약

| 항목 | 규약 |
|---|---|
| PK | `uuid DEFAULT gen_random_uuid()` |
| 금액 | `bigint` (KRW 정수, 소수점 없음) |
| enum | `text` + `CHECK` (PG enum 타입 미사용 — 값 추가 시 마이그레이션 부담 회피) |
| updated_at | 공용 트리거 `set_updated_at()` (비즈니스 로직 트리거는 **금지**, 이것만 예외) |
| 뷰 | 전부 `security_invoker = on` (RLS 통과) |
| 삭제 컬럼 | `accounts.current_balance`, `assets.current_value`, `budgets.total_income/total_expense` → 뷰 대체 |
| 삭제 테이블 | `investment_returns` → `monthly_investment_summary_v` 대체 (수동 입력분은 legacy 스키마에 보존) |
| 잔액 규칙 | income: +amount / expense·transfer: 출금계좌 −amount, `to_account_id` +amount / **저축 거래(type='expense'+expenseKind='saving'+to_account_id)도 toAccount +amount** |
| 집계 규칙 | 예산·결산·잔액 모두 `status='applied'`만 집계 (pending = 미래 정기거래) |

---

## 1. 테이블 DDL

### 1.0 공용 트리거 함수

```sql
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
```

각 테이블 생성 직후 아래 형식으로 부착한다(updated_at 보유 테이블 전부):

```sql
CREATE TRIGGER trg_<table>_updated_at
  BEFORE UPDATE ON public.<table>
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

### 1.1 categories

```sql
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
```

> 소분류는 부모의 `expense_kind`를 상속한다(앱/RPC 계층 규칙, commit 9c2dffd). 집계는 항상 `COALESCE(parent_id, id)` 롤업.

### 1.2 accounts

```sql
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
  asset_id          uuid REFERENCES public.assets(id) ON DELETE SET NULL,
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
```

> `assets` 를 먼저 생성하거나, `asset_id` FK는 `ALTER TABLE ... ADD CONSTRAINT`로 후행 부착(마이그레이션 파일에서는 assets → accounts 순서로 생성).

### 1.3 transactions

```sql
CREATE TABLE public.transactions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type                text NOT NULL CHECK (type IN ('income','expense','transfer')),
  amount              bigint NOT NULL CHECK (amount > 0),
  description         text NOT NULL,
  status              text NOT NULL DEFAULT 'applied' CHECK (status IN ('pending','applied')),
  category_id         uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  account_id          uuid NOT NULL REFERENCES public.accounts(id),
  to_account_id       uuid REFERENCES public.accounts(id),
  recurring_id        uuid REFERENCES public.recurring_transactions(id) ON DELETE SET NULL,
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
```

> 저축 거래 = `type='expense'` + `to_account_id NOT NULL` + 카테고리 `expense_kind='saving'`. CHECK로 강제하지 않는 이유: 카테고리 조인이 필요해 CHECK로 표현 불가 → RPC(`create_transaction`) 검증 + pgTAP 테스트로 보증.

### 1.4 tags / transaction_tags

```sql
CREATE TABLE public.tags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  color      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.transaction_tags (
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  tag_id         uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, tag_id)
);
```

### 1.5 budgets / budget_items

```sql
CREATE TABLE public.budgets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  year       integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  month      integer CHECK (month IS NULL OR month BETWEEN 1 AND 12), -- NULL = 연간 예산
  -- total_income / total_expense 삭제: budget_totals_v 로 파생
  memo       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- PG15+: 연간 예산(month=NULL)도 연도당 1개만 허용
  CONSTRAINT uq_budgets_year_month UNIQUE NULLS NOT DISTINCT (year, month)
);

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
```

### 1.6 asset_categories / assets / asset_valuations

```sql
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

CREATE TABLE public.assets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  asset_category_id uuid NOT NULL REFERENCES public.asset_categories(id),
  acquisition_date  date NOT NULL,
  acquisition_cost  bigint NOT NULL CHECK (acquisition_cost >= 0),
  -- current_value 삭제: asset_values_v 로 파생
  institution       text,
  memo              text,
  is_active         boolean NOT NULL DEFAULT true,
  metadata          jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

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
```

### 1.7 recurring_transactions

```sql
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
```

### 1.8 forecast_scenarios / forecast_results

```sql
CREATE TABLE public.forecast_scenarios (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  assumptions jsonb,
  start_date  date NOT NULL,
  end_date    date NOT NULL CHECK (end_date > start_date),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.forecast_results (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id         uuid NOT NULL REFERENCES public.forecast_scenarios(id) ON DELETE CASCADE,
  date                date NOT NULL,
  projected_income    bigint NOT NULL,
  projected_expense   bigint NOT NULL,
  projected_balance   bigint NOT NULL,
  projected_net_worth bigint NOT NULL,
  details             jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_forecast_results_scenario_date UNIQUE (scenario_id, date)
);
```

> 예측 결과는 파생값이지만 "시나리오 실행 시점의 스냅샷"이라는 사실(fact) 성격 — 저장 유지. 계산은 TS 순수 함수.

### 1.9 investment_trades (파생 저장 예외)

```sql
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
  CONSTRAINT chk_trades_remaining_le_qty CHECK (remaining_quantity <= quantity),
  CONSTRAINT chk_trades_gain_sell_only   CHECK (trade_type = 'sell' OR realized_gain = 0),
  CONSTRAINT chk_trades_remaining_buy_only CHECK (trade_type = 'buy' OR remaining_quantity = 0)
);
```

> 계좌 효과(잔액 뷰에서 사용): **buy → account_id −total_amount / sell·dividend → account_id +net_amount** (account_id 있을 때만).
> **net_amount 규약(확정)**: buy = total_amount + fee + tax(총 지출) / sell·dividend = total_amount − fee − tax(실수령). RPC 서두와 Zod(createInvestmentTradeSchema)에서 이중 검증한다.
> 일반 UPDATE/DELETE 경로로 `remaining_quantity`/`realized_gain`을 건드리지 못하도록 앱 계층에서는 RPC만 사용하고, `REVOKE UPDATE(remaining_quantity, realized_gain) ON investment_trades FROM authenticated` 컬럼 권한으로 이중 방어한다(§5).

---

## 2. 뷰 정의

### 2.1 account_balances_v — 잔액의 유일한 진실

`잔액 = initial_balance + Σ(적용된 거래 효과) + Σ(투자 매매의 계좌 효과)`

```sql
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
```

> **도메인 규칙 재확인**: 저축 거래(type='expense' + to_account_id)는 UNION ALL 두 번째 분기에서 `to_account_id`에 +amount 처리됨. 두 분기 모두 `status='applied'` 필터.

> **카드 잔액 의미(확정)**: 카드 계좌(type='card')의 `account_balances_v.current_balance`는 **음수가 미결제금을 의미한다**(미결제금 = |음수 잔액|). `get_dashboard.total_balance`는 카드 음수 잔액을 그대로 합산한다(카드빚이 순자산에서 차감되는 순포지션 — 의도된 동작). 초과 결제 가드는 두지 않는다 — 단일 사용자 앱이며, 결제 초과분(양수 잔액)은 선결제 크레딧으로 해석한다.

### 2.2 open_lots_v — 열린 FIFO 로트

```sql
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
```

### 2.3 asset_values_v — 자산 현재가치

규칙(구 `syncAssetFromAccount` 이식):
- 연결 계좌 또는 보유 로트가 있으면 → `Σ연결 계좌 잔액 + Σ(unit_price × remaining_quantity)`
- 둘 다 없으면(비금융 자산 등) → 최신 평가액, 그것도 없으면 취득원가

```sql
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
```

### 2.4 budget_totals_v — 예산 합계

규칙: 같은 예산 안에 소분류 항목이 존재하는 대분류 항목은 합계에서 제외(중복 방지, 구 `upsertBudgetItem` 재계산 로직 이식).

```sql
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
```

### 2.5 monthly_investment_summary_v — investment_returns 대체

```sql
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
```

> 구 `investment_returns`의 `unrealized_gain`/`return_rate`(수동 입력)는 뷰로 파생 불가 → legacy 스키마 보존 후 필요 시 노출 여부 재판단(MIGRATION.md §4.14).

### 2.6 category_rollup_v — 대분류 롤업 공용 뷰 (Phase 2 통합)

거래 × 대분류 롤업(`COALESCE(parent_id, id)`, 소분류는 부모의 name/expense_kind/color 상속)이
`get_monthly_settlement`·`get_annual_settlement`·report-service(trend·categories) 4곳에
중복돼 있던 것을 단일 행 단위 뷰로 통합(집계는 호출부). 마이그레이션 `20260716000010`.

```sql
CREATE OR REPLACE VIEW public.category_rollup_v
WITH (security_invoker = on) AS
SELECT
  t.id                                       AS transaction_id,
  t.date, t.type, t.status, t.amount,
  COALESCE(c.parent_id, c.id)                AS category_id,
  COALESCE(pc.name, c.name, '미분류')         AS category_name,
  COALESCE(pc.expense_kind, c.expense_kind)  AS expense_kind,
  COALESCE(pc.color, c.color)                AS color
FROM public.transactions t
LEFT JOIN public.categories c  ON c.id = t.category_id
LEFT JOIN public.categories pc ON pc.id = c.parent_id;
```

---

## 3. RPC 함수

원칙: 쓰기 RPC는 **단일 왕복·원자 처리**, 잔액 UPDATE·자산 동기화 없음(파생이므로). 읽기 RPC는 화면 1개 = 1왕복.
모든 함수는 `SECURITY INVOKER`, `SET search_path = public` 을 명시한다.

**RAISE ERRCODE 규약 (확정, SEC-L2)**: 도메인 검증 RAISE는 메시지 매칭이 아니라 커스텀 SQLSTATE로 API 에러에 매핑한다 — `CF422` = 저축 거래 정합성 위반(→ 422 `SAVING_CATEGORY_REQUIRED`), `CF404` = 자원 없음(→ 404 `NOT_FOUND`), `CF409` = 동일 연·월 예산 중복(→ 409 `DUPLICATE_BUDGET`), `CF490` = 매도에 소진된 매수 로트 삭제 금지(→ 409 `TRADE_HAS_DEPENDENTS`). 투자 트랙(2C)이 초안에서 쓰던 `CF409`는 예산 트랙(2A)과의 SQLSTATE 충돌로 **Phase 2 머지에서 `CF490`으로 재배정**했다(마이그레이션 `20260713000030` 헤더 참조). 그 외 투자 규약: `CF400` = 잘못된 입력(→ 400 `VALIDATION_ERROR`), `CF423` = 보유수량 부족(→ 422 `INSUFFICIENT_HOLDINGS`). 매핑은 `src/server/api-errors.ts`에서 단일 관리. 저축 정합성은 `assert_tx_saving_consistency(type, category_id, to_account_id)` 헬퍼가 순방향(saving 카테고리 → 입금 계좌 필수)과 역방향(입금 계좌 보유 지출 → saving 카테고리 필수)을 모두 검증하며, `create_transaction`은 입력 기준·`update_transaction`은 부분 PATCH 병합 후 **최종 상태** 기준으로 호출한다(마이그레이션 `20260710140000_phase1_saving_consistency.sql`). 아래 3.1 초안의 인라인 검증·`P0001`은 초기 설계 기록이다.
**예외(확정)**: `create_investment_trade` / `delete_investment_trade` 2개 함수만 `SECURITY DEFINER SET search_path = public` 으로 확정한다(§5의 FIFO 컬럼 REVOKE와의 충돌 해소). 이 2개 함수는 **함수 로직이 유일한 FIFO 무결성 통제**이므로 입력 검증을 함수 서두에 집중한다. 나머지 RPC는 전부 SECURITY INVOKER 유지.

### 3.1 create_transaction(p jsonb) → transactions (실행 가능 초안)

```sql
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
```

### 3.2 update_transaction(p_id uuid, p jsonb) → transactions

```sql
CREATE OR REPLACE FUNCTION public.update_transaction(p_id uuid, p jsonb)
RETURNS public.transactions
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
```

의사코드 (잔액이 파생이므로 **역계산·보정 로직 없음** — 단순 UPDATE + 태그 교체):

```
1. UPDATE transactions SET
     type          = CASE WHEN p ? 'type'        THEN p->>'type'                 ELSE type        END,
     amount        = CASE WHEN p ? 'amount'      THEN (p->>'amount')::bigint     ELSE amount      END,
     description   = ..., status = ..., category_id = ..., account_id = ...,
     to_account_id = ..., date = ..., memo = ...,
     installment_months = ..., installment_current = ...
   WHERE id = p_id
   RETURNING * INTO v_row;
   IF NOT FOUND → RAISE 'TRANSACTION_NOT_FOUND'
2. IF p ? 'tags' THEN
     DELETE FROM transaction_tags WHERE transaction_id = p_id;
     -- 3.1과 동일한 unnest upsert 블록 재실행
   END IF
3. RETURN v_row
```

### 3.3 delete_transaction(p_id uuid) → boolean

```sql
CREATE OR REPLACE FUNCTION public.delete_transaction(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  DELETE FROM transactions WHERE id = p_id;  -- transaction_tags는 FK CASCADE
  RETURN FOUND;
END $$;
```

### 3.4 create_investment_trade(p jsonb) → investment_trades (FIFO, 실행 가능 초안)

```sql
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
    RAISE EXCEPTION '잘못된 trade_type: %', p->>'trade_type' USING ERRCODE = 'P0001';
  END IF;
  IF COALESCE((p->>'quantity')::numeric, 0) <= 0
     OR COALESCE((p->>'total_amount')::bigint, -1) < 0
     OR COALESCE((p->>'net_amount')::bigint, -1) < 0 THEN
    RAISE EXCEPTION '잘못된 수량/금액 입력입니다' USING ERRCODE = 'P0001';
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
    -- 먼저 잠근 후 갱신한다. delete_investment_trade(§3.5)와 동일한 (date, id) 오름차순
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
        USING ERRCODE = 'P0001';
    END IF;

    -- 실현손익 = 매도 수령액(net) − 매칭된 매수 원가
    UPDATE investment_trades
    SET realized_gain = round(v_row.net_amount - v_total_cost)::bigint
    WHERE id = v_row.id
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END $$;
```

> TS 레퍼런스 구현(`matchSellToLots`)과 property-based 교차 검증 대상. 정렬 키 `(date, id)` 동일(잠금 순서와 FIFO 적용 순서가 같은 키를 사용).

### 3.5 delete_investment_trade(p_id uuid) → boolean (역FIFO 복원)

```sql
CREATE OR REPLACE FUNCTION public.delete_investment_trade(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row     public.investment_trades;
  v_lot     record;
  v_restore numeric;
  v_r       numeric;
BEGIN
  -- [SECURITY DEFINER] 함수 로직이 유일한 FIFO 무결성 통제 — 검증(대상 존재·삭제 가드)을 서두에 집중
  SELECT * INTO v_row FROM investment_trades WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  -- [신규 가드] 일부 매도된 buy 로트 삭제 금지(구 코드에 없던 FIFO 무결성 보호)
  IF v_row.trade_type = 'buy' AND v_row.remaining_quantity < v_row.quantity THEN
    RAISE EXCEPTION '이미 일부 매도에 매칭된 매수 기록은 삭제할 수 없습니다. 매도 기록을 먼저 삭제하세요'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_row.trade_type = 'sell' THEN
    -- [잠금 순서 통일] create_investment_trade(§3.4)와 동일하게, 대상 로트 전체를
    -- 단일 문장 SELECT ... ORDER BY date, id FOR UPDATE 로 먼저 잠근다(데드락 제거).
    -- 역FIFO 적용 순서는 잠금 후 메모리에서 date DESC 로 처리한다.
    -- 트레이드오프: 동일 자산 동시 매도/삭제는 직렬화됨 — 단일 사용자 앱이라 허용.
    PERFORM 1
    FROM investment_trades
    WHERE asset_id = v_row.asset_id
      AND trade_type = 'buy'
      AND quantity > remaining_quantity
      AND (ticker = v_row.ticker OR (ticker IS NULL AND v_row.ticker IS NULL))
    ORDER BY date, id
    FOR UPDATE;

    -- 역FIFO: 가장 최근에 차감된 로트(quantity > remaining)부터 복원 (잠금 완료 후, 추가 잠금 없음)
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
```

> 역FIFO는 원 매칭 기록이 없으므로 근사 복원(레거시 `reverseLotMatching`과 동일 동작). 매도가 여러 건 겹친 뒤 중간 매도를 삭제하면 순서에 따라 원래 상태와 다를 수 있음 — 레거시와 동일한 알려진 한계로, 스냅샷 fixture 회귀 테스트로 커버.

### 3.6 calc_next_date — 월말/윤년 보정 헬퍼 (process_due_transactions 내부용)

```sql
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
    ELSE RAISE EXCEPTION '알 수 없는 frequency: %', p_frequency;
  END CASE;
  -- 월말 보정: 1/31+1개월=2/28, 2/29(윤년)+1년=2/28
  RETURN v_first
       + LEAST(v_day,
               EXTRACT(DAY FROM (v_first + interval '1 month - 1 day'))::integer)
       - 1;
END $$;
```

> **주의**: 레거시 TS(`calculateNextDate`)와 동일하게 앵커는 "현재 next_date의 일(day)"이다. 즉 1/31→2/28 이후에는 3/28로 진행(3/31 아님). 레거시 동작 보존이 우선이므로 그대로 이식하고, 교차 검증 테스트(TS ↔ SQL)에 이 케이스를 포함한다.

### 3.7 process_due_transactions(p_today date DEFAULT ...) → jsonb

```sql
CREATE OR REPLACE FUNCTION public.process_due_transactions(
  p_today date DEFAULT (now() AT TIME ZONE 'Asia/Seoul')::date
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
```

의사코드:

```
1. 도래한 pending 거래 적용 (한 문장):
     UPDATE transactions SET status = 'applied'
     WHERE status = 'pending' AND date <= p_today
     → applied_count

2. FOR r IN SELECT * FROM recurring_transactions
            WHERE is_active AND next_date <= p_today FOR UPDATE LOOP
     a. v_next := r.next_date
        WHILE v_next <= p_today LOOP
          v_next := calc_next_date(v_next, r.frequency, r.recur_interval)  -- 월말 보정
        END LOOP
     b. IF r.end_date IS NOT NULL AND v_next > r.end_date THEN
          UPDATE recurring_transactions SET is_active = false, next_date = v_next WHERE id = r.id
        ELSE
          UPDATE recurring_transactions SET next_date = v_next WHERE id = r.id
        END IF
     c. 미래 pending 재충전(12개월 유지):
        v_horizon := LEAST(COALESCE(r.end_date, p_today + interval '12 months'),
                           p_today + interval '12 months')
        기존 pending 마지막 날짜 이후 ~ v_horizon 까지 calc_next_date 로 날짜를 전개하며
        INSERT INTO transactions(status='pending', recurring_id=r.id, ...) 일괄 생성
        (generate 결과를 배열로 모아 INSERT ... SELECT unnest 1문장)
   END LOOP

3. RETURN jsonb_build_object('applied', applied_count,
                             'generated', generated_count,
                             'deactivated', deactivated_count)
```

> 멱등성: 같은 날 두 번 실행돼도 (1)은 대상이 없고 (2c)는 기존 pending 이후 날짜만 생성하므로 안전. 접속 시 온디맨드 보정 호출도 동일 함수 사용.

### 3.8 snapshot_asset_valuations(p_date date DEFAULT ...) → integer

```sql
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
```

> `source='estimate'`(추정치)는 자동 스냅샷이 **덮어쓴다** — 추정치가 실측 기반 자동값(`auto`)으로 대체되는 것이 의도된 동작. `manual`(수동 입력)만 보존된다.

### 3.9 get_dashboard(p_year int, p_month int) → jsonb (대시보드 1왕복)

시그니처: `get_dashboard(p_year integer, p_month integer) RETURNS jsonb`

전부 `jsonb_build_object` 하위 쿼리로 조립, 왕복 1회. Phase 2 통합에서
확정된 최종 형태(마이그레이션 `20260716000010`):

```
RETURN jsonb_build_object(
  'total_balance',   (SELECT SUM(current_balance) FROM account_balances_v WHERE is_active),
  'account_count',   활성 계좌 수,
  'net_worth',       자산 미연동 활성 계좌 잔액 합
                       (account_balances_v ⋈ accounts WHERE asset_id IS NULL)
                     + (SELECT SUM(current_value) FROM asset_values_v WHERE is_active)
                     -- 자산 연동 계좌 잔액은 asset_values_v 에 포함 → 이중 계상 방지,
  'month_income'  / 'month_expense':
        SELECT SUM(amount) FILTER (WHERE type='income'), SUM(...) FILTER (WHERE type='expense')
        FROM transactions
        WHERE date >= 월초 AND date < 익월초 AND status='applied',
  'investment',      활성 자산이 하나도 없으면 null (UI 빈 상태), 아니면
                     jsonb_build_object(
                       'totalValue',   Σ asset_values_v.current_value (is_active),
                       'invested' / 'sold' / 'dividend' / 'realizedGain':
                          해당 월 monthly_investment_summary_v 합계),
  'budget_usage',    해당 월 예산이 없으면 null (UI 빈 상태), 아니면
                     jsonb_build_object(
                       'plannedTotal', budget_totals_v.total_expense,
                       'actualTotal',  실지출(= month_expense — get_budget_actuals 와
                                       동일 필터: type='expense', status='applied', 저축 포함),
                       'ratio',        actual / planned * 100 (소수 1자리) —
                                       planned 0 → null (get_budget_actuals 규약)),
  'calendar',        (SELECT jsonb_agg(jsonb_build_object('date', date, 'income', Σ, 'expense', Σ))
                      FROM transactions WHERE 해당 월 AND status='applied' GROUP BY date),
  'recent_transactions', 최근 5건 — **선택 월(p_year/p_month) 범위 내 + KST 오늘
                         ((now() AT TIME ZONE 'Asia/Seoul')::date) 이하 날짜만**
                         (pending 포함 — Transaction DTO 인라인 조립, 마이그레이션 `20260721000010`)
)
```

> **investment/budget_usage 키는 camelCase**(DTO 그대로 통과 — `dashboard-mapping.ts`).

> **캘린더 pending 제외(확정)**: 캘린더 집계는 `status='applied'` 거래만 포함한다(레거시 동일). pending(예정) 거래는 캘린더·집계에 나타나지 않으며, **거래 목록 화면에서만 '예정' 배지로 표시**한다.

> **recent_transactions 범위(확정, `20260721000010`)**: `date >= v_start AND date < v_end AND date <= v_today`.
> status 필터는 두지 않는다 — 과거 날짜의 pending(지연 처리된 정기거래 등)은 거래 목록과
> 동일하게 '예정' 배지로 계속 노출한다. 미래 pending은 날짜 조건만으로 이미 배제된다.
> **의도된 동작**: 미래 월(`p_year`/`p_month`가 KST 오늘보다 뒤)을 조회하면 `v_start > v_today`가
> 되어 이 위젯은 항상 빈 배열을 반환한다 — 다른 위젯(캘린더·예산·투자 등)은 이 규칙의 영향을
> 받지 않는다.

### 3.10 get_monthly_settlement(p_year int, p_month int) → jsonb

시그니처: `get_monthly_settlement(p_year integer, p_month integer) RETURNS jsonb`

의사코드 (settlement-service.ts의 검증된 SQL 원형 이식):

```
v_start := make_date(p_year, p_month, 1);  v_end := v_start + interval '1 month';

-- (1) 카테고리 집계: 대분류 롤업 COALESCE(parent_id, id)
category_totals AS (
  SELECT COALESCE(c.parent_id, c.id)            AS category_id,
         COALESCE(pc.name, c.name, '미분류')     AS category_name,
         t.type,
         COALESCE(pc.expense_kind, c.expense_kind) AS expense_kind,
         SUM(t.amount)::bigint                  AS amount
  FROM transactions t
  LEFT JOIN categories c  ON t.category_id = c.id
  LEFT JOIN categories pc ON c.parent_id  = pc.id
  WHERE t.date >= v_start AND t.date < v_end
    AND t.type IN ('income','expense')          -- 저축은 expense이므로 자동 포함
    AND t.status = 'applied'
  GROUP BY 1, 2, 3, 4
)

-- (2) 계좌별 기초/기말: 기초 = initial_balance + 월 시작 전 누적 효과(+투자 매매 효과)
pre_effects AS (
  account_balances_v 와 동일한 UNION ALL 패턴에 t.date < v_start 조건 추가
  + 투자 매매 효과에도 date < v_start 조건 추가
),
month_effects AS (
  in  = income + (transfer/expense 의 to_account_id 입금)   -- 저축 입금 포함
  out = expense + transfer 출금
  (date >= v_start AND date < v_end AND status='applied')
)
account_changes := 계좌별 { opening_balance, income, expense,
                            closing_balance = opening + income - expense }

-- (3) 전월 비교
previous_month := 전월 범위로 SUM income/expense (status='applied')

RETURN jsonb_build_object(
  'year', 'month',
  'total_income'  = Σ category_totals WHERE type='income',
  'total_expense' = Σ category_totals WHERE type='expense',
  'net_income',
  'income_by_category', 'expense_by_category'(expense_kind 포함 — 저축/소비 구분 표시),
  'account_changes',
  'previous_month')
```

> **배당의 결산 처리(확정)**: 배당(dividend)은 `investment_trades`에만 기록되며 `transactions`에 없으므로 **결산(get_monthly_settlement)의 총수입에 포함되지 않는다** — 레거시 동작 보존. 배당은 대시보드/투자 요약의 `investment.dividend`로만 표시된다.

### 3.11 get_budget_actuals(p_year int, p_month int) → jsonb (가상 항목 포함)

시그니처: `get_budget_actuals(p_year integer, p_month integer) RETURNS jsonb`

의사코드:

```
actuals AS (
  -- 실적: get_monthly_settlement (1)과 동일한 대분류 롤업, status='applied',
  -- type IN ('income','expense')  ← 저축(expense+saving) 포함, transfer 제외
),
planned AS (
  SELECT bi.category_id, bi.planned_amount, c.parent_id
  FROM budgets b JOIN budget_items bi ON bi.budget_id = b.id
  JOIN categories c ON c.id = bi.category_id
  WHERE b.year = p_year AND b.month = p_month
)
items := planned FULL OUTER JOIN actuals ON category_id
  규칙(구 budget-service 이식):
  - 예산 없고 실적만 있는 카테고리 → planned_amount = 0 인 "가상 항목" 추가
  - 부모 예산 항목이 있는 소분류 실적 → 별도 항목 생성 안 함(부모로 롤업됨)
  - 소분류 예산 항목이 있는 부모 → 부모 자신의 롤업 실적 항목 제외(중복 방지)
  각 항목: { category_id, category_name, type, expense_kind,
             planned_amount, actual_amount,
             difference = planned - actual,
             achievement_rate = actual / NULLIF(planned,0) * 100 }

RETURN jsonb_build_object('budget_id', ..., 'items', jsonb_agg(...),
                          'totals', budget_totals_v 조인 + 실적 합계)
```

### 3.12 get_annual_grid(p_year int, p_type text DEFAULT NULL, p_expense_kind text DEFAULT NULL) → jsonb

시그니처: `get_annual_grid(p_year integer, p_type text DEFAULT NULL, p_expense_kind text DEFAULT NULL) RETURNS jsonb`

의사코드 (12개월 × 카테고리 예산 그리드, 구 AnnualGridService 이식):

```
rows AS (
  SELECT b.month, bi.category_id, c.parent_id, c.name, c.type,
         COALESCE(pc.expense_kind, c.expense_kind) AS expense_kind,
         bi.planned_amount
  FROM budgets b
  JOIN budget_items bi ON bi.budget_id = b.id
  JOIN categories c    ON c.id = bi.category_id
  LEFT JOIN categories pc ON pc.id = c.parent_id
  WHERE b.year = p_year AND b.month IS NOT NULL
    AND (p_type IS NULL OR c.type = p_type)
    AND (p_expense_kind IS NULL OR COALESCE(pc.expense_kind, c.expense_kind) = p_expense_kind)
)
그룹핑 규칙:
  - 그룹 키 = COALESCE(parent_id, category_id)
  - 그룹 월합계: 소분류 항목이 있는 달은 소분류만 합산, 없으면 대분류 자신
RETURN jsonb: { groups: [ { parent, categories[], monthly_totals{1..12}, total } ],
                monthly_totals{1..12}, grand_total }
```

### 3.13 get_investment_summary(p_scope text, p_year int, p_month int) → jsonb (투자 수익 요약)

시그니처: `get_investment_summary(p_scope text /* 'all'|'month'|'year' */, p_year integer DEFAULT NULL, p_month integer DEFAULT NULL) RETURNS jsonb`

API.md §11.6 `/investment-trades/summary` 의 단일 왕복 구현. 모든 매매 기록을 누락 없이 집계한다(커밋 76da628 회귀 방지).

의사코드:

```
-- (0) 기간 결정
range := CASE p_scope
  WHEN 'all'   THEN 전체 기간 (조건 없음)
  WHEN 'year'  THEN [make_date(p_year, 1, 1), +1 year)
  WHEN 'month' THEN [make_date(p_year, p_month, 1), +1 month)

-- (1) 자산(종목)별 집계: 기간 내 전 매매 기록
per_asset AS (
  SELECT t.asset_id, t.ticker,
         Σ total_amount  FILTER (trade_type='buy')      AS total_buy,      -- 총매수
         Σ net_amount    FILTER (trade_type='sell')     AS total_sell,     -- 총매도
         Σ net_amount    FILTER (trade_type='dividend') AS dividend_income,-- 배당
         Σ realized_gain FILTER (trade_type='sell')     AS realized_gain,  -- 실현손익
         Σ fee AS fee_total, Σ tax AS tax_total
  FROM investment_trades t
  WHERE t.date ∈ range
  GROUP BY t.asset_id, t.ticker
),

-- (2) 보유 현황: open_lots_v 활용 (보유 수량·잔여 원가 → 평균단가)
holdings AS (
  SELECT asset_id, ticker,
         SUM(remaining_quantity) AS holding_qty,
         SUM(remaining_cost)     AS holding_cost   -- 평균단가 = holding_cost / holding_qty
  FROM open_lots_v
  GROUP BY asset_id, ticker
)

-- (3) 수익률: 자산별 = (realized_gain + dividend_income) / NULLIF(total_buy, 0) × 100
--     전체  = Σ(realized_gain + dividend_income) / NULLIF(Σ total_buy, 0) × 100

RETURN jsonb_build_object(
  'total',  { total_buy, total_sell, realized_gain, dividend_income,
              fee_total, tax_total,
              net_profit = realized_gain + dividend_income,
              return_rate },
  'assets', jsonb_agg(자산별 { asset_id, ticker, total_buy, total_sell,
                              dividend_income, realized_gain, return_rate,
                              holding_qty, avg_buy_price }))
```

---

## 4. 인덱스 전체 목록

```sql
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

-- budgets / budget_items
CREATE INDEX idx_budgets_year              ON public.budgets (year);
CREATE INDEX idx_budget_items_budget_id    ON public.budget_items (budget_id);
CREATE INDEX idx_budget_items_category_id  ON public.budget_items (category_id);

-- assets / asset_valuations
CREATE INDEX idx_assets_asset_category_id ON public.assets (asset_category_id);
CREATE INDEX idx_assets_is_active         ON public.assets (is_active);
CREATE INDEX idx_asset_valuations_asset_date ON public.asset_valuations (asset_id, date DESC); -- 최신 평가 DISTINCT ON 최적화
CREATE INDEX idx_asset_valuations_date       ON public.asset_valuations (date);

-- recurring_transactions
CREATE INDEX idx_recurring_due ON public.recurring_transactions (next_date) WHERE is_active;

-- forecast_results
CREATE INDEX idx_forecast_results_scenario_id ON public.forecast_results (scenario_id);

-- investment_trades
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
```

> `uq_*` UNIQUE 제약이 만드는 인덱스(budgets(year,month), budget_items(budget_id,category_id), asset_valuations(asset_id,date), forecast_results(scenario_id,date), tags(name))는 위 목록과 별도로 자동 생성된다.
>
> 검색(`description`/`memo` ILIKE)은 3만 건 규모에서 Seq Scan으로 기준(<100ms) 내(docs/perf/phase1-explain.md) — 검색 지연이 체감되는 시점(수십만 건 또는 >100ms)에 `pg_trgm` GIN 인덱스(`gin_trgm_ops`)를 도입한다.

---

## 5. RLS 정책

**인가 경계 (확정)**: 실질 인가 경계는 앱 서버의 `guarded()`(세션 검증 + `OWNER_EMAIL` 소유자 검증, `src/server/api-guard.ts`)다. 아래 RLS는 PostgREST/anon 노출 표면을 방어하는 계층이며, 앱의 postgres.js 직결 경로(테이블 소유자 롤)에는 적용되지 않는다 — 이는 의식적 아키텍처 결정이다. 보조 가드로 프로덕션 기동 시 슈퍼유저 접속을 차단한다(`src/server/db/role-guard.ts`).

단일 사용자 앱이지만 Supabase(PostgREST)로 노출되므로 전 테이블 RLS 필수. 원칙: **anon 완전 차단 + authenticated 는 소유자 검증 필수**. `USING (true)` 정책은 금지 — 정책 USING/WITH CHECK 에 소유자 이메일 검증(`auth.jwt()->>'email' = current_setting('app.owner_email', true)` 또는 소유자 uuid 상수 비교)을 **필수**로 적용한다. 아울러 컷오버 시 Supabase Auth 신규 가입을 비활성화한다(MIGRATION.md §7 체크리스트).

```sql
-- 소유자 이메일을 DB 설정으로 고정 (또는 정책에 소유자 uuid 상수를 직접 비교해도 됨)
ALTER DATABASE postgres SET app.owner_email = '<소유자 이메일>';

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'categories','accounts','transactions','tags','transaction_tags',
    'budgets','budget_items','asset_categories','assets','asset_valuations',
    'recurring_transactions','forecast_scenarios','forecast_results','investment_trades'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I_owner_all ON public.%I
         FOR ALL TO authenticated
         USING (auth.jwt()->>''email'' = current_setting(''app.owner_email'', true))
         WITH CHECK (auth.jwt()->>''email'' = current_setting(''app.owner_email'', true))', t, t);
  END LOOP;
END $$;

-- anon 차단 + 기본 권한 정리
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, public;
GRANT EXECUTE ON FUNCTION
  public.create_transaction(jsonb),
  public.update_transaction(uuid, jsonb),
  public.delete_transaction(uuid),
  public.create_investment_trade(jsonb),
  public.delete_investment_trade(uuid),
  public.process_due_transactions(date),
  public.snapshot_asset_valuations(date),
  public.get_dashboard(integer, integer),
  public.get_monthly_settlement(integer, integer),
  public.get_budget_actuals(integer, integer),
  public.get_annual_grid(integer, text, text),
  public.get_investment_summary(text, integer, integer)
TO authenticated;

-- FIFO 상태 컬럼 이중 방어: 일반 UPDATE 경로에서 로트 상태 변조 차단
REVOKE UPDATE (remaining_quantity, realized_gain)
  ON public.investment_trades FROM authenticated;
-- [확정] 컬럼 REVOKE 와의 충돌 해소를 위해 create/delete_investment_trade 두 함수만
-- SECURITY DEFINER + SET search_path = public 으로 확정한다(§3.4/§3.5).
-- 이 2개 함수는 함수 로직이 유일한 FIFO 무결성 통제이므로 입력 검증을 함수 서두에 집중한다.
-- 나머지 RPC는 전부 SECURITY INVOKER 유지.
```

> 뷰는 전부 `security_invoker = on` 이므로 기반 테이블 RLS가 그대로 적용된다. `legacy` 스키마(마이그레이션 기간)는 PostgREST 노출 스키마에 포함하지 않고 `REVOKE ALL ON SCHEMA legacy FROM anon, authenticated`.

---

## 6. pg_cron 잡 정의

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 매일 00:05 KST (= 15:05 UTC): 도래 정기거래 적용 + 12개월 pending 재충전
SELECT cron.schedule(
  'process-due-transactions',
  '5 15 * * *',
  $$SELECT public.process_due_transactions()$$
);

-- 매일 00:10 KST (= 15:10 UTC): 자산 평가 스냅샷 (process_due 이후 실행되도록 5분 간격)
SELECT cron.schedule(
  'snapshot-asset-valuations',
  '10 15 * * *',
  $$SELECT public.snapshot_asset_valuations()$$
);
```

- pg_cron 은 UTC 기준 스케줄 → KST 자정 직후로 환산해 설정. `process_due_transactions` 기본 인자가 `Asia/Seoul` 기준 오늘 날짜이므로 날짜 경계 안전.
- 크론 실패 대비: 앱 접속 시(레이아웃 서버 컴포넌트) 온디맨드로 `process_due_transactions()` 를 1일 1회 조건부 호출(멱등이라 중복 호출 무해).
- 잡 상태 점검: `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;`

---

## 부록 A. 마이그레이션 파일 구성 순서 (Supabase CLI)

```
supabase/migrations/
  0001_extensions.sql        -- pg_cron, (uuid-ossp 불필요: gen_random_uuid 내장)
  0002_tables.sql            -- §1 (assets/asset_categories → accounts → 나머지, FK 순서 준수)
  0003_indexes.sql           -- §4
  0004_views.sql             -- §2 (account_balances_v → open_lots_v → asset_values_v → ...)
  0005_functions.sql         -- §3 (calc_next_date 먼저)
  0006_rls.sql               -- §5
  0007_cron.sql              -- §6
```

SQL 마이그레이션이 단일 진실(SQL-first), Drizzle 스키마는 타입·쿼리빌더용으로 병행 유지(뷰·함수는 Drizzle 관리 대상 아님).

---

## 부록 B. 성능 실측 게이트 (Phase 1 필수)

Phase 1 통합 테스트에서 아래를 **의무화**한다:

- `account_balances_v`·`get_dashboard` 에 `EXPLAIN (ANALYZE, BUFFERS)` 캡처를 의무화하고, **수만 건 시드 기준 각 <100ms** 를 확인한다.
- `budget_totals_v` 의 `NOT EXISTS` 상관 서브쿼리 실행계획도 확인한다(카테고리 수 대비 비용 검증).
- 캡처 결과는 통합 테스트 아티팩트로 보존하고, 기준 미달 시 인덱스·뷰 재설계 없이 다음 단계로 진행하지 않는다.
