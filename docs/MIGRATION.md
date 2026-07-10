# Cashflow v2 — 데이터 마이그레이션 계획서 (구 Supabase → 신 Supabase)

> 전제: 신 스키마는 [DB.md](./DB.md) 기준으로 신 Supabase 프로젝트에 이미 적용된 상태.
> 전략: 구 DB 전량을 신 DB `legacy` 스키마에 원본 그대로 적재 → **idempotent 변환 SQL** 로 `public` 에 적재 → 4대 대사 → 컷오버. legacy 스키마는 컷오버 후 1개월 보존.

## 0. 원칙

| 항목 | 정책 |
|---|---|
| id 변환 | `text → uuid`. 정상 UUID 문자열은 직접 캐스팅, 아니면 **uuid v5 결정적 생성**(동일 입력 → 동일 uuid, FK 정합 유지). §2 `legacy.to_uuid` |
| 삭제 컬럼 | `accounts.current_balance`, `assets.current_value`, `budgets.total_income/total_expense` → 이관하지 않음. **대사(§5)에서 파생 뷰와 비교하는 용도로만 사용** |
| 삭제 테이블 | `investment_returns` → 이관하지 않음. legacy 스키마에 보존, `monthly_investment_summary_v` 로 대체. 수동 입력분(unrealized_gain, return_rate)은 보존 기간 중 노출 여부 재판단 |
| 컬럼명 변경 | `recurring_transactions.interval` → `recur_interval` |
| 금액 | integer → bigint 캐스팅(무손실) |
| FIFO 상태 | `remaining_quantity`, `realized_gain` 은 legacy 저장값을 **그대로 이관**(재계산하지 않음) 후 §5.3 대사로 검증 |
| 멱등성 | 모든 변환 SQL은 `ON CONFLICT (id) DO NOTHING` — 재실행 안전 |
| 집계 진실 | 잔액 불일치 시 거래 이력을 진실로 채택. 저장값을 유지해야 하는 계좌만 '잔액 보정' 거래 삽입(§6) |

## 1. 절차: 동결 → 덤프 → legacy 적재

### 1.1 동결 (쓰기 중단)

```bash
# 구 앱 배포를 read-only 로 전환하거나 Vercel 환경변수로 쓰기 차단.
# 최후 수단(DB 레벨): 구 DB에서
psql "$OLD_DB_URL" -c "ALTER DATABASE postgres SET default_transaction_read_only = on;"
# (해제: ... = off)
```

### 1.2 구 DB 덤프

```bash
# Supabase 구 프로젝트 연결 문자열 (Session pooler 5432 또는 direct)
export OLD_DB_URL='postgresql://postgres.<old-ref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres'
export NEW_DB_URL='postgresql://postgres.<new-ref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres'

# 스키마+데이터 custom 포맷 덤프 (public 스키마만)
pg_dump "$OLD_DB_URL" \
  --schema=public \
  --no-owner --no-privileges \
  -Fc -f cashflow-legacy-$(date +%Y%m%d).dump
```

### 1.3 legacy 스키마로 적재 (스키마 rename 경유 — sed 치환 금지)

덤프 SQL을 `sed 's/public./legacy./'` 로 치환하는 방식은 **COPY 데이터(메모 텍스트 등)까지 오염**시킬 수 있어 금지. 로컬 스크래치 DB에서 스키마를 rename 한 뒤 재덤프한다.

```bash
# (로컬 Postgres 필요 — supabase start 의 로컬 DB 사용 가능)
createdb cashflow_scratch
pg_restore --no-owner --no-privileges -d cashflow_scratch cashflow-legacy-*.dump

psql cashflow_scratch <<'SQL'
ALTER SCHEMA public RENAME TO legacy;
CREATE SCHEMA public;  -- 스크래치 DB 정상화용
SQL

# legacy 스키마만 다시 덤프 → 신 DB에 적재
pg_dump cashflow_scratch --schema=legacy --no-owner --no-privileges -f legacy-schema.sql
psql "$NEW_DB_URL" -f legacy-schema.sql

# PostgREST 노출 차단
psql "$NEW_DB_URL" <<'SQL'
REVOKE ALL ON SCHEMA legacy FROM anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA legacy FROM anon, authenticated;
SQL
```

## 2. id 변환 헬퍼 (결정적 uuid)

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- uuid_generate_v5

CREATE OR REPLACE FUNCTION legacy.to_uuid(t text)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN t IS NULL THEN NULL
    WHEN t ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN t::uuid
    -- 프로젝트 고정 네임스페이스 상수 사용 (uuid_ns_url() 같은 범용 네임스페이스 금지 —
    -- 프로젝트 전용 네임스페이스로 충돌 도메인 격리)
    ELSE uuid_generate_v5('6f7a0d1e-2b3c-4d5e-8f90-1a2b3c4d5e6f'::uuid, 'cashflow:' || t)
  END
$$;
```

리허설 시 legacy PK 포맷 분포를 확인해 UUID 직접 캐스팅 분기의 실효성을 검증한다:

```sql
-- 테이블별 id 포맷 분포 (uuid 포맷 vs 비-uuid 포맷 건수)
SELECT 'transactions' AS tbl,
       count(*) FILTER (WHERE id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') AS uuid_format,
       count(*) FILTER (WHERE id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') AS non_uuid_format
FROM legacy.transactions
-- (accounts, categories, ... 전 테이블 동일 패턴으로 UNION ALL)
;
```

## 3. 적재 순서 (FK 2-pass)

자기참조 FK(`categories.parent_id`, `accounts.linked_account_id`)와 순환은 **1차 INSERT(NULL) → 2차 UPDATE** 로 처리.

```
1. asset_categories
2. assets                      (asset_category FK)
3. categories                  [2-pass: parent_id]
4. accounts                    [2-pass: linked_account_id] (asset_id는 assets 선행으로 1-pass 가능)
5. tags
6. recurring_transactions
7. transactions                (categories/accounts/recurring 선행 필요)
8. transaction_tags
9. budgets → budget_items
10. asset_valuations
11. investment_trades
12. forecast_scenarios → forecast_results
(investment_returns: 이관 제외 — legacy 보존)
```

## 4. 테이블별 변환 SQL

> 전부 `ON CONFLICT (id) DO NOTHING` (junction 은 PK 충돌 기준) — 재실행 안전.

### 4.1 asset_categories

| 구 컬럼 | 신 컬럼 | 변환 |
|---|---|---|
| id text | id uuid | `legacy.to_uuid` |
| 나머지 | 동일 | 그대로 |

```sql
INSERT INTO public.asset_categories (id, name, kind, icon, color, sort_order, created_at, updated_at)
SELECT legacy.to_uuid(id), name, kind, icon, color, sort_order, created_at, updated_at
FROM legacy.asset_categories
ON CONFLICT (id) DO NOTHING;
```

### 4.2 assets (current_value 폐기)

```sql
INSERT INTO public.assets (id, name, asset_category_id, acquisition_date, acquisition_cost,
                           institution, memo, is_active, metadata, created_at, updated_at)
SELECT legacy.to_uuid(id), name, legacy.to_uuid(asset_category_id), acquisition_date,
       acquisition_cost::bigint,      -- current_value 는 이관 안 함(§5.2 대사용)
       institution, memo, is_active, metadata, created_at, updated_at
FROM legacy.assets
ON CONFLICT (id) DO NOTHING;
```

### 4.3 categories (2-pass: parent_id)

```sql
-- 1-pass
INSERT INTO public.categories (id, name, type, expense_kind, icon, color,
                               parent_id, sort_order, is_active, created_at, updated_at)
SELECT legacy.to_uuid(id), name, type,
       -- 신 CHECK 보정: expense 인데 expense_kind NULL 인 레거시 행은 'consumption' 기본값
       CASE WHEN type = 'expense' THEN COALESCE(expense_kind, 'consumption') ELSE NULL END,
       icon, color, NULL, sort_order, is_active, created_at, updated_at
FROM legacy.categories
ON CONFLICT (id) DO NOTHING;

-- 2-pass
UPDATE public.categories n
SET parent_id = legacy.to_uuid(l.parent_id)
FROM legacy.categories l
WHERE n.id = legacy.to_uuid(l.id) AND l.parent_id IS NOT NULL;
```

### 4.4 accounts (current_balance 폐기, 2-pass: linked_account_id)

```sql
-- 1-pass
INSERT INTO public.accounts (id, name, type, initial_balance, color, icon, is_active, sort_order,
                             asset_id, deposit_type, term_months, interest_rate, tax_type,
                             open_date, monthly_payment, billing_day, credit_limit,
                             linked_account_id, created_at, updated_at)
SELECT legacy.to_uuid(id), name, type, initial_balance::bigint,   -- current_balance 이관 안 함
       color, icon, is_active, sort_order,
       legacy.to_uuid(asset_id), deposit_type, term_months, interest_rate, tax_type,
       open_date, monthly_payment::bigint, billing_day, credit_limit::bigint,
       NULL, created_at, updated_at
FROM legacy.accounts
ON CONFLICT (id) DO NOTHING;

-- 2-pass
UPDATE public.accounts n
SET linked_account_id = legacy.to_uuid(l.linked_account_id)
FROM legacy.accounts l
WHERE n.id = legacy.to_uuid(l.id) AND l.linked_account_id IS NOT NULL;
```

### 4.5 tags

```sql
INSERT INTO public.tags (id, name, color, created_at)
SELECT legacy.to_uuid(id), name, color, created_at
FROM legacy.tags
ON CONFLICT (id) DO NOTHING;
```

### 4.6 recurring_transactions (interval → recur_interval)

```sql
INSERT INTO public.recurring_transactions (id, type, amount, description, category_id, account_id,
                                           to_account_id, frequency, recur_interval,
                                           start_date, end_date, next_date, is_active,
                                           created_at, updated_at)
SELECT legacy.to_uuid(id), type, amount::bigint, description,
       legacy.to_uuid(category_id), legacy.to_uuid(account_id), legacy.to_uuid(to_account_id),
       frequency, "interval",       -- 예약어 회피 rename
       start_date, end_date, next_date, is_active, created_at, updated_at
FROM legacy.recurring_transactions
ON CONFLICT (id) DO NOTHING;
```

### 4.7 transactions

> **도메인 규칙 확인**: 저축 거래는 legacy 에서 이미 `type='expense' + to_account_id` 로 통일됨(구 마이그레이션 0013). 여기서는 무변환 이관 — 신 잔액 뷰가 to_account_id +amount 로 처리한다. `status` 도 그대로 이관(pending 미래 거래 포함).

```sql
INSERT INTO public.transactions (id, type, amount, description, status, category_id, account_id,
                                 to_account_id, recurring_id, date, memo,
                                 installment_months, installment_current, created_at, updated_at)
SELECT legacy.to_uuid(id), type, amount::bigint, description, status,
       legacy.to_uuid(category_id), legacy.to_uuid(account_id), legacy.to_uuid(to_account_id),
       legacy.to_uuid(recurring_id), date, memo,
       installment_months, installment_current, created_at, updated_at
FROM legacy.transactions
-- 신 CHECK 위반 예방: 자기 자신 이체(있어선 안 되는 오염 데이터)는 제외하고 §5 대사에서 보고
WHERE to_account_id IS NULL OR to_account_id <> account_id
ON CONFLICT (id) DO NOTHING;

-- 제외된 오염 행 보고 (0건이어야 정상)
SELECT id, type, date, amount FROM legacy.transactions
WHERE to_account_id IS NOT NULL AND to_account_id = account_id;
```

### 4.8 transaction_tags

```sql
INSERT INTO public.transaction_tags (transaction_id, tag_id)
SELECT legacy.to_uuid(transaction_id), legacy.to_uuid(tag_id)
FROM legacy.transaction_tags lt
WHERE EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = legacy.to_uuid(lt.transaction_id))
ON CONFLICT DO NOTHING;
```

### 4.9 budgets / budget_items (total_* 폐기)

```sql
INSERT INTO public.budgets (id, name, year, month, memo, created_at, updated_at)
SELECT legacy.to_uuid(id), name, year, month, memo, created_at, updated_at
FROM legacy.budgets                     -- total_income/total_expense 이관 안 함
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.budget_items (id, budget_id, category_id, planned_amount, memo, created_at, updated_at)
SELECT legacy.to_uuid(id), legacy.to_uuid(budget_id), legacy.to_uuid(category_id),
       planned_amount::bigint, memo, created_at, updated_at
FROM legacy.budget_items
ON CONFLICT (id) DO NOTHING;
```

### 4.10 asset_valuations

```sql
INSERT INTO public.asset_valuations (id, asset_id, date, value, source, memo, created_at, updated_at)
SELECT legacy.to_uuid(id), legacy.to_uuid(asset_id), date, value::bigint, source, memo,
       created_at, updated_at
FROM legacy.asset_valuations
ON CONFLICT (id) DO NOTHING;
```

### 4.11 investment_trades (FIFO 상태 그대로 이관)

```sql
INSERT INTO public.investment_trades (id, asset_id, trade_type, date, ticker, quantity, unit_price,
                                      total_amount, fee, tax, net_amount, memo, account_id,
                                      remaining_quantity, realized_gain, created_at, updated_at)
SELECT legacy.to_uuid(id), legacy.to_uuid(asset_id), trade_type, date, ticker,
       quantity::numeric(20,8), unit_price::bigint, total_amount::bigint,
       fee::bigint, tax::bigint, net_amount::bigint, memo, legacy.to_uuid(account_id),
       -- 신 CHECK(chk_trades_remaining_buy_only / gain_sell_only) 보정
       CASE WHEN trade_type = 'buy'  THEN remaining_quantity::numeric(20,8) ELSE 0 END,
       CASE WHEN trade_type = 'sell' THEN realized_gain::bigint             ELSE 0 END,
       created_at, updated_at
FROM legacy.investment_trades
ON CONFLICT (id) DO NOTHING;
```

### 4.12 forecast_scenarios / forecast_results

```sql
INSERT INTO public.forecast_scenarios (id, name, description, assumptions, start_date, end_date,
                                       created_at, updated_at)
SELECT legacy.to_uuid(id), name, description, assumptions, start_date, end_date,
       created_at, updated_at
FROM legacy.forecast_scenarios
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.forecast_results (id, scenario_id, date, projected_income, projected_expense,
                                     projected_balance, projected_net_worth, details,
                                     created_at, updated_at)
SELECT legacy.to_uuid(id), legacy.to_uuid(scenario_id), date,
       projected_income::bigint, projected_expense::bigint,
       projected_balance::bigint, projected_net_worth::bigint,
       details, created_at, updated_at
FROM legacy.forecast_results
ON CONFLICT (id) DO NOTHING;
```

### 4.13 시퀀스/기본값

신 스키마는 시퀀스 미사용(uuid) — 후처리 불필요.

### 4.14 investment_returns (이관 제외)

```sql
-- 이관하지 않음. 보존 확인만:
SELECT count(*) AS preserved_rows FROM legacy.investment_returns;
-- 수동 입력분(unrealized_gain <> 0 OR return_rate <> 0) 목록을 보존 기간 내 사용자와 검토:
SELECT asset_id, year, month, unrealized_gain, return_rate, memo
FROM legacy.investment_returns
WHERE unrealized_gain <> 0 OR COALESCE(return_rate, 0) <> 0;
```

## 5. 4대 대사 쿼리

### 5.1 Row count 대사

```sql
WITH pairs(tbl, legacy_cnt, new_cnt) AS (VALUES
  ('asset_categories',       (SELECT count(*) FROM legacy.asset_categories),       (SELECT count(*) FROM public.asset_categories)),
  ('assets',                 (SELECT count(*) FROM legacy.assets),                 (SELECT count(*) FROM public.assets)),
  ('categories',             (SELECT count(*) FROM legacy.categories),             (SELECT count(*) FROM public.categories)),
  ('accounts',               (SELECT count(*) FROM legacy.accounts),               (SELECT count(*) FROM public.accounts)),
  ('tags',                   (SELECT count(*) FROM legacy.tags),                   (SELECT count(*) FROM public.tags)),
  ('recurring_transactions', (SELECT count(*) FROM legacy.recurring_transactions), (SELECT count(*) FROM public.recurring_transactions)),
  ('transactions',           (SELECT count(*) FROM legacy.transactions),           (SELECT count(*) FROM public.transactions)),
  ('transaction_tags',       (SELECT count(*) FROM legacy.transaction_tags),       (SELECT count(*) FROM public.transaction_tags)),
  ('budgets',                (SELECT count(*) FROM legacy.budgets),                (SELECT count(*) FROM public.budgets)),
  ('budget_items',           (SELECT count(*) FROM legacy.budget_items),           (SELECT count(*) FROM public.budget_items)),
  ('asset_valuations',       (SELECT count(*) FROM legacy.asset_valuations),       (SELECT count(*) FROM public.asset_valuations)),
  ('investment_trades',      (SELECT count(*) FROM legacy.investment_trades),      (SELECT count(*) FROM public.investment_trades)),
  ('forecast_scenarios',     (SELECT count(*) FROM legacy.forecast_scenarios),     (SELECT count(*) FROM public.forecast_scenarios)),
  ('forecast_results',       (SELECT count(*) FROM legacy.forecast_results),       (SELECT count(*) FROM public.forecast_results))
)
SELECT tbl, legacy_cnt, new_cnt, new_cnt - legacy_cnt AS diff,
       CASE WHEN legacy_cnt = new_cnt THEN 'PASS' ELSE 'FAIL' END AS result
FROM pairs
ORDER BY (legacy_cnt = new_cnt), tbl;
-- 허용 예외: transactions 는 4.7의 자기이체 오염 행 수만큼 diff 허용(보고서에 명기)
```

transactions 의 허용 diff 는 감으로 넘기지 않고, 자기이체 오염 행 제외 건수를 명시적으로 계산해 diff 와 일치하는지 **자동 검증**한다:

```sql
-- 자기이체 오염 행 제외 건수 == row count diff 자동 검증 (PASS 필수)
WITH excluded AS (
  SELECT count(*) AS cnt
  FROM legacy.transactions
  WHERE to_account_id IS NOT NULL AND to_account_id = account_id   -- §4.7 제외 조건과 동일
),
counts AS (
  SELECT (SELECT count(*) FROM legacy.transactions) AS legacy_cnt,
         (SELECT count(*) FROM public.transactions) AS new_cnt
)
SELECT c.legacy_cnt, c.new_cnt, e.cnt AS excluded_self_transfer,
       c.legacy_cnt - c.new_cnt AS diff,
       CASE WHEN c.legacy_cnt - c.new_cnt = e.cnt THEN 'PASS' ELSE 'FAIL' END AS result
FROM counts c, excluded e;
```

### 5.2 잔액 대사 (legacy 저장값 vs 파생 뷰)

```sql
SELECT la.id            AS legacy_id,
       la.name,
       la.current_balance                    AS legacy_stored,
       ab.current_balance                    AS derived,
       ab.current_balance - la.current_balance AS diff
FROM legacy.accounts la
JOIN public.account_balances_v ab ON ab.account_id = legacy.to_uuid(la.id)
WHERE la.current_balance <> ab.current_balance
ORDER BY abs(ab.current_balance - la.current_balance) DESC;
-- 0행 = PASS. 불일치 행 = 구 앱의 잔액 드리프트 증거 → §6 정책으로 처리
```

보조: 자산가치 대사

```sql
SELECT la.id, la.name, la.current_value AS legacy_stored, av.current_value AS derived,
       av.current_value - la.current_value AS diff
FROM legacy.assets la
JOIN public.asset_values_v av ON av.asset_id = legacy.to_uuid(la.id)
WHERE la.current_value <> av.current_value;
```

### 5.3 FIFO 수량 대사

```sql
-- (a) 건별: legacy 저장 로트 상태가 그대로 이관되었는가
SELECT l.id, l.ticker, l.trade_type,
       l.remaining_quantity AS legacy_rq, n.remaining_quantity AS new_rq,
       l.realized_gain      AS legacy_rg, n.realized_gain      AS new_rg
FROM legacy.investment_trades l
JOIN public.investment_trades n ON n.id = legacy.to_uuid(l.id)
WHERE (l.trade_type = 'buy'  AND n.remaining_quantity <> l.remaining_quantity)
   OR (l.trade_type = 'sell' AND n.realized_gain      <> l.realized_gain);

-- (b) 불변식: 종목별 Σ잔여수량 == Σ매수수량 − Σ매도수량 (음수 보유 불가)
SELECT asset_id, ticker,
       COALESCE(SUM(quantity)           FILTER (WHERE trade_type = 'buy'),  0) AS bought,
       COALESCE(SUM(quantity)           FILTER (WHERE trade_type = 'sell'), 0) AS sold,
       COALESCE(SUM(remaining_quantity) FILTER (WHERE trade_type = 'buy'),  0) AS remaining
FROM public.investment_trades
GROUP BY asset_id, ticker
HAVING COALESCE(SUM(remaining_quantity) FILTER (WHERE trade_type = 'buy'), 0)
    <> COALESCE(SUM(quantity) FILTER (WHERE trade_type = 'buy'),  0)
     - COALESCE(SUM(quantity) FILTER (WHERE trade_type = 'sell'), 0);
-- 0행 = PASS. 불일치 시 legacy 데이터 자체의 FIFO 드리프트 →
-- TS 레퍼런스 FIFO 로 전체 재계산한 값과 3-way 비교 후 재계산값 채택 여부 결정
```

### 5.4 결산 대사 (최근 3개월 + 강제 표본, 필드 단위)

legacy 원본과 신 DB에 **동일한 롤업 SQL** 을 적용해 비교한다(대분류 롤업 `COALESCE(parent_id,id)`, `status='applied'`, 저축 expense 포함).

**표본 강제 포함**: 최근 3개월 외에 아래 두 조건의 달을 대사 표본에 반드시 포함한다(잔액·결산 규칙의 특수 경로 검증):

- **저축 거래가 있는 달**: `type='expense' AND to_account_id IS NOT NULL` 거래가 존재하는 달 최소 1개
- **카드 결제 이체가 있는 달**: `type='transfer' AND to_account_id = (카드 계좌)` 거래가 존재하는 달 최소 1개

```sql
-- 표본 후보 탐색
SELECT to_char(t.date, 'YYYY-MM') AS ym,
       bool_or(t.type = 'expense' AND t.to_account_id IS NOT NULL)  AS has_saving,
       bool_or(t.type = 'transfer' AND ca.type = 'card')            AS has_card_payment
FROM legacy.transactions t
LEFT JOIN legacy.accounts ca ON ca.id = t.to_account_id
GROUP BY 1 ORDER BY 1 DESC;
```

```sql
WITH params AS (
  SELECT (date_trunc('month', now() AT TIME ZONE 'Asia/Seoul') - interval '3 months')::date AS from_d,
         (date_trunc('month', now() AT TIME ZONE 'Asia/Seoul'))::date                        AS to_d
),
legacy_s AS (
  SELECT to_char(t.date, 'YYYY-MM') AS ym,
         COALESCE(c.parent_id, c.id) AS category_key,   -- text id
         t.type,
         SUM(t.amount)::bigint AS amount
  FROM legacy.transactions t
  LEFT JOIN legacy.categories c ON t.category_id = c.id
  CROSS JOIN params p
  WHERE t.date >= p.from_d AND t.date < p.to_d
    AND t.type IN ('income', 'expense')
    AND t.status = 'applied'
  GROUP BY 1, 2, 3
),
new_s AS (
  SELECT to_char(t.date, 'YYYY-MM') AS ym,
         COALESCE(c.parent_id, c.id) AS category_key,   -- uuid
         t.type,
         SUM(t.amount)::bigint AS amount
  FROM public.transactions t
  LEFT JOIN public.categories c ON t.category_id = c.id
  CROSS JOIN params p
  WHERE t.date >= p.from_d AND t.date < p.to_d
    AND t.type IN ('income', 'expense')
    AND t.status = 'applied'
  GROUP BY 1, 2, 3
)
SELECT COALESCE(l.ym, n.ym) AS ym,
       COALESCE(legacy.to_uuid(l.category_key)::text, n.category_key::text) AS category,
       COALESCE(l.type, n.type) AS type,
       l.amount AS legacy_amount,
       n.amount AS new_amount,
       COALESCE(n.amount, 0) - COALESCE(l.amount, 0) AS diff
FROM legacy_s l
FULL OUTER JOIN new_s n
  ON n.ym = l.ym AND n.type = l.type
 AND n.category_key = legacy.to_uuid(l.category_key)
WHERE COALESCE(l.amount, 0) <> COALESCE(n.amount, 0)
ORDER BY ym, type;
-- 0행 = PASS
-- 추가로 계좌별 기초/기말 검증: get_monthly_settlement(y,m)->'account_changes' 의
-- closing_balance 가 account_balances_v(월말 시점 재계산)와 일치하는지 3개월 샘플 확인
```

## 6. 잔액 불일치 시 '잔액 보정' 거래 삽입 정책

§5.2 불일치는 구 앱의 잔액 드리프트(즉시 동기화 버그) 증거다. **거래 이력을 진실로 채택**하는 것이 기본이며, 사용자가 "구 앱 표시 잔액이 실제 잔액"이라고 확인한 계좌에 한해 보정 거래를 삽입한다.

정책:

1. 불일치 계좌 목록(§5.2 결과)을 사용자에게 제시, 계좌별로 채택값 확정(파생값 vs 저장값).
2. 저장값 채택 계좌만 아래 보정 거래 삽입 — 보정 후 `account_balances_v` 가 legacy 저장값과 일치하게 됨.

```sql
-- 사전 준비: 보정 전용 카테고리 (수입/지출 각 1개)
INSERT INTO public.categories (name, type, expense_kind, is_active)
VALUES ('잔액 보정(수입)', 'income', NULL, true),
       ('잔액 보정(지출)', 'expense', 'consumption', true)
ON CONFLICT DO NOTHING;

-- diff = derived - legacy_stored
--   diff > 0 → 파생이 더 큼 → expense 보정(−diff)
--   diff < 0 → 파생이 더 작음 → income 보정(+|diff|)
-- 채택 계좌 목록을 approved(account_id uuid, diff bigint) 로 정리한 뒤:
INSERT INTO public.transactions (type, amount, description, status, category_id, account_id, date, memo)
SELECT CASE WHEN a.diff > 0 THEN 'expense' ELSE 'income' END,
       abs(a.diff),
       '마이그레이션 잔액 보정',
       'applied',
       (SELECT id FROM public.categories
        WHERE name = CASE WHEN a.diff > 0 THEN '잔액 보정(지출)' ELSE '잔액 보정(수입)' END),
       a.account_id,
       DATE '<컷오버 전일>',
       'v1→v2 마이그레이션 대사에서 확인된 구 앱 잔액 드리프트 보정. legacy diff=' || a.diff
FROM approved a
WHERE a.diff <> 0;
```

주의:

- 보정 거래는 **일반 expense/consumption·income** 이므로 해당 월 결산·예산 실적에 잡힌다. 보정 금액이 크면 사용자에게 고지하고, 결산 화면에서 '잔액 보정' 카테고리를 구분 표시한다.
- 보정 후 §5.2 를 재실행해 0행(채택값 기준) 확인.
- 보정 내역은 대사 리포트에 계좌·금액·방향을 표로 보존한다.

## 7. 컷오버 체크리스트

- [ ] **리허설**: legacy PK 포맷 분포 확인(§2 쿼리 — UUID 직접 캐스팅 분기 실효성 검증), 변환 SQL 전체 드라이런
- [ ] **T-1일**: 구 앱 공지, 신 프로덕션 스키마·RLS·pg_cron 적용 확인(`SELECT * FROM cron.job;`)
- [ ] Supabase Auth **신규 가입 비활성화**(소유자 계정 생성 후 — RLS 소유자 검증(DB.md §5)과 함께 이중 방어)
- [ ] **동결**: 구 앱 쓰기 중단(§1.1), 동결 시각 기록
- [ ] 덤프 파일 생성 + 체크섬 기록, 별도 저장소 보관 (`shasum -a 256 *.dump`)
- [ ] legacy 스키마 적재 완료, `legacy` PostgREST 비노출·권한 차단 확인
- [ ] 변환 SQL 실행(§3 순서) — 실행 로그 보존
- [ ] **4대 대사 all-pass**: §5.1 count / §5.2 잔액 / §5.3 FIFO / §5.4 결산 — 리포트 저장
- [ ] 잔액 불일치 건 사용자 확정 → 보정 거래 삽입(§6) → §5.2 재검증
- [ ] `process_due_transactions()` 수동 1회 실행 — 동결 기간 중 도래분 처리 확인 + **동결 기간 도래 정기거래 일괄 처리 시간 측정**(리포트에 기록)
- [ ] `snapshot_asset_valuations()` 수동 1회 실행 — asset_valuations 오늘자 스냅샷 확인
- [ ] 신 앱 스모크: 거래 저장 p95 <500ms, 대시보드/결산/예산/투자 화면 값 육안 대조(3개 샘플 월)
- [ ] 신 앱 E2E: 거래 생성→잔액 뷰 반영, 매도→실현손익, 저축 거래→예산·결산 포함 확인
- [ ] DNS/Vercel 프로덕션 전환, 구 앱 read-only 유지(롤백 경로)
- [ ] **T+30일**: legacy 스키마·구 프로젝트 삭제 판단(investment_returns 수동 입력분 처리 확정 포함)

롤백 기준: 4대 대사 실패를 24시간 내 해소하지 못하면 컷오버 중단, 구 앱 쓰기 재개(동결 해제). 신 DB는 변환 SQL이 멱등이므로 `public` 데이터만 TRUNCATE 후 재시도 가능.
