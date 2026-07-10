# Cashflow v2 아키텍처

> 재구축 계획(`curious-orbiting-rocket`)의 "목표 아키텍처" 섹션을 구체화한 문서.
> RPC/뷰의 **상세 시그니처·DDL은 [DB.md](./DB.md)가 단일 진실**이며, 본 문서는 이름과 파라미터만 참조한다.
> REST 엔드포인트 상세는 [API.md](./API.md) 참조.

---

## 1. 설계 원칙

1. **파생 상태를 저장하지 않는다.** 저장은 사실(fact)만 — 거래, 매매, 평가이력, 예산 항목. 잔액·자산가치·예산합계·결산은 읽기 시점에 뷰/집계 RPC로 계산한다. 유일한 예외는 FIFO 로트 상태(`remaining_quantity`, `realized_gain`)이며, 변경은 RPC 내부에서만 일어난다.
2. **쓰기 = DB 왕복 1회.** 모든 변경은 단일 Postgres 함수(RPC) 호출로 원자 처리한다. 앱 레벨 트랜잭션 조립 금지.
3. **화면 하나 = 왕복 1~2회.** 화면 단위 집계는 전용 RPC(`get_dashboard` 등) 또는 뷰 1회 조회로 해결한다.
4. **REST 단일 진입점.** 변경 API는 `/app/api/v1/**` 라우트 핸들러만 사용한다. Server Actions 배제(향후 Android 앱 REST 재사용). RSC는 초기 데이터 조회에 한해 서비스 계층을 직접 호출할 수 있다(변경 불가).
5. **비즈니스 로직 트리거 금지.** 트리거는 `updated_at` 갱신만 허용. 배치성 로직은 pg_cron.
6. **순수 계산은 TS 유지.** 예측(forecast), 예·적금 이자 계산, 월말 보정은 프레임워크 독립 순수 함수로 `src/lib/calculations`·`src/lib/forecast`에 둔다.

---

## 2. 계층 다이어그램

```text
┌────────────────────────────────────────────────────────────────────┐
│ Client (PWA / 모바일 브라우저 / 향후 Android)                        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ src/features/<기능>/components  (프레젠테이션)                 │  │
│  │ src/features/<기능>/hooks       (useQuery/useMutation)        │  │
│  │ src/features/<기능>/api.ts      (typed fetch 클라이언트)       │  │
│  │ src/lib/query-keys.ts           (쿼리 키 팩토리 · 단일 정의)    │  │
│  └───────────────┬──────────────────────────────────────────────┘  │
└──────────────────┼─────────────────────────────────────────────────┘
                   │ HTTPS  REST JSON  { success, data | error }
┌──────────────────▼─────────────────────────────────────────────────┐
│ Next.js (Vercel — Supabase와 동일 리전)                              │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ app/api/v1/**  라우트 핸들러                                   │  │
│  │   · 인증(Supabase 세션) · Zod 검증 · 응답 envelope             │  │
│  └───────────────┬──────────────────────────────────────────────┘  │
│  ┌───────────────▼──────────────────────────────────────────────┐  │
│  │ src/server/services/*  (도메인 서비스 · 프레임워크 독립)        │  │
│  │ src/server/rpc.ts      callRpc<T>(name, params) — 쓰기·집계    │  │
│  │ src/server/db.ts       postgres.js (pooler 6543, prepare:off) │  │
│  └───────────────┬──────────────────────────────────────────────┘  │
│  RSC 초기 데이터 ──┘ (읽기 전용, services 직접 호출)                  │
└──────────────────┼─────────────────────────────────────────────────┘
                   │ 단일 SQL 왕복 (RPC 호출 또는 뷰 SELECT)
┌──────────────────▼─────────────────────────────────────────────────┐
│ Supabase Postgres                                                   │
│  ┌────────────────────────┐  ┌────────────────────────────────┐    │
│  │ 쓰기 RPC (plpgsql)      │  │ 읽기: 뷰 + 집계 RPC             │    │
│  │  create_transaction     │  │  account_balances_v            │    │
│  │  update_transaction     │  │  asset_values_v                │    │
│  │  delete_transaction     │  │  budget_totals_v               │    │
│  │  create_investment_trade│  │  open_lots_v                   │    │
│  │  delete_investment_trade│  │  monthly_investment_summary_v  │    │
│  └────────────────────────┘  │  get_dashboard(y,m)             │    │
│  ┌────────────────────────┐  │  get_monthly_settlement(y,m)    │    │
│  │ 테이블 = 사실(fact)만    │  │  get_budget_actuals(y,m)       │    │
│  │ (파생 컬럼 없음)         │  │  get_annual_grid(y,type,kind)  │    │
│  └────────────────────────┘  └────────────────────────────────┘    │
│  pg_cron: 정기거래 처리 · 자산 평가 스냅샷                            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. 디렉터리 구조

```text
src/
├── app/
│   ├── (dashboard)/                # 페이지 라우트 (RSC 초기 데이터 = services 직접 호출)
│   ├── api/v1/                     # REST v1 — 유일한 변경 진입점 (API.md)
│   │   ├── transactions/route.ts
│   │   ├── transactions/[id]/route.ts
│   │   ├── accounts/…  budgets/…  settlements/…  dashboard/…
│   │   └── … (자원별, API.md의 14개 자원과 1:1)
│   ├── manifest.ts                 # PWA
│   └── sw.ts                       # Serwist
├── server/                         # 서버 전용 (client 번들 유입 금지, 'server-only')
│   ├── db.ts                       # postgres.js 커넥션 (§8 연결 설정)
│   ├── rpc.ts                      # callRpc<T>(name, params: Json): Promise<T>
│   ├── auth.ts                     # Supabase 세션 검증 헬퍼
│   └── services/                   # 도메인 서비스 — 라우트 핸들러와 RSC가 공유
│       ├── transaction-service.ts
│       ├── account-service.ts
│       ├── budget-service.ts
│       ├── settlement-service.ts
│       ├── asset-service.ts
│       ├── investment-service.ts
│       ├── recurring-service.ts
│       ├── forecast-service.ts
│       └── report-service.ts
├── features/                       # 기능별 수직 분할 (화면 단위)
│   ├── transactions/
│   │   ├── components/             # 입력 폼, 목록, 필터, 캘린더
│   │   ├── hooks/                  # use-transactions.ts, use-create-transaction.ts …
│   │   └── api.ts                  # typed fetch: getTransactions(filter), createTransaction(input) …
│   ├── accounts/    budgets/    settlements/    dashboard/
│   ├── assets/      investments/ recurring/     forecast/
│   ├── reports/     categories/
│   └── (각 기능 동일 구조: components/ hooks/ api.ts)
├── components/ui/                  # shadcn/ui 등 기능 무관 공용 컴포넌트
├── lib/
│   ├── query-keys.ts               # 쿼리 키 팩토리 단일 정의 (§6)
│   ├── validators/                 # Zod 스키마 (API.md 요청 본문과 1:1)
│   ├── calculations/               # 이자 계산기, 월말 보정, FIFO TS 레퍼런스
│   ├── forecast/                   # 예측 알고리즘 (순수 TS)
│   ├── api-response.ts             # successResponse / errorResponse envelope
│   └── format.ts                   # Intl.NumberFormat('ko-KR') 등
├── stores/                         # Zustand — 클라이언트 상태만 (서버 상태 미러링 금지)
└── types/                          # 공유 타입 (API DTO 포함)

supabase/
├── migrations/                     # Supabase CLI SQL — 스키마·뷰·RPC의 단일 진실 (SQL-first)
├── tests/                          # pgTAP (supabase test db)
└── seed.sql

tests/
├── unit/                           # Vitest — 순수 함수
├── integration/                    # Vitest + 로컬 Supabase — RPC·뷰 블랙박스
├── cross/                          # TS FIFO 레퍼런스 == RPC 교차 검증 (property-based)
└── e2e/                            # Playwright
```

**의존 방향 규칙**: `features → lib`, `features → (fetch) api/v1`, `api/v1 → server/services → server/rpc|db`. 역방향·수평(feature 간 직접 import) 금지. `server/**`는 `server-only` 패키지로 클라이언트 유입을 빌드 타임에 차단.

---

## 4. 쓰기 경로 시퀀스 (왕복 수 명시)

### 4.1 거래 생성 — 총 DB 왕복 1회 (기존 8~12회)

```text
Client                    Route Handler                Postgres
  │ POST /api/v1/transactions   │                          │
  │ ───────────────────────────►│                          │
  │ (동시에 낙관적 업데이트 §7)   │ ① 세션 검증(메모리/JWT)    │
  │                             │ ② Zod parse (DB 0회)      │
  │                             │ ③ callRpc(               │
  │                             │    'create_transaction', │
  │                             │     p_payload jsonb)      │
  │                             │ ─────────────────────────►│ [단일 트랜잭션]
  │                             │                          │ INSERT transactions
  │                             │                          │ 태그 upsert (unnest 배열, 루프 없음)
  │                             │                          │ junction INSERT
  │                             │                          │ RETURNS jsonb(태그 포함 거래)
  │                             │ ◄─────────────────────────│  ← 재조회 왕복 없음
  │ ◄───────────────────────────│ 201 { success, data }     │
  │ onSettled: 해당 월 키만 무효화 (§6.3)                      │
```

- 잔액 UPDATE 없음, 자산 동기화 없음 — 잔액은 `account_balances_v`가 파생.
- 예상 총 지연 200~300ms (p95 목표 <500ms, E2E 어설션 대상).

### 4.2 거래 수정/삭제 — 각 1왕복

- `PATCH` → `update_transaction(p_id, p_payload)`: UPDATE + 태그 diff upsert를 함수 내부에서 처리. 잔액이 파생이므로 **역계산(reverse-balance) 로직 자체가 없음**.
- `DELETE` → `delete_transaction(p_id)`: DELETE 한 문장(태그 junction은 FK CASCADE).

### 4.3 투자 매매 생성/삭제 — 각 1왕복

```text
POST /api/v1/investment-trades
  └► callRpc('create_investment_trade', p_payload)      ── 1왕복
       [함수 내부] 매도 시: 대상 로트 SELECT … FOR UPDATE (잠금)
                  → FIFO 시간순 차감 · realized_gain 계산 · trade INSERT
       [매수/배당]: trade INSERT (+ 매수는 로트 생성)
DELETE /api/v1/investment-trades/{id}
  └► callRpc('delete_investment_trade', p_id)           ── 1왕복
       [함수 내부] 매도 삭제 시 역FIFO 복원, 매수 삭제 시 의존 매도 존재하면 에러
```

- 동일 FIFO 로직의 TS 레퍼런스 구현을 `src/lib/calculations/fifo.ts`에 유지하고, 랜덤 매매 시퀀스 property-based 테스트로 RPC 결과와 교차 검증한다(§10).

### 4.4 기타 쓰기 (계좌·카테고리·예산 등 단순 CRUD)

파생 상태가 없는 단순 엔티티는 RPC 없이 서비스 계층의 단문 INSERT/UPDATE/DELETE(1왕복)로 충분하다. 다건 원자성이 필요한 경우(예산+items 저장, 정렬 일괄 변경)만 RPC 또는 단일 문장(`unnest` 배치 UPDATE)으로 1왕복화한다.

---

## 5. 읽기 경로 시퀀스 (왕복 수 명시)

| 화면 | 호출 | DB 왕복 |
|---|---|---|
| 대시보드 | `GET /api/v1/dashboard?year=&month=` → `get_dashboard(p_year, p_month)` (카드+캘린더 일별 합계+예산 소진율+최근 거래를 단일 jsonb로) | **1** |
| 거래 목록 | `GET /api/v1/transactions?…` → 거래 조회(태그·카테고리 조인 포함) + total count(윈도우 함수 `count(*) over()`) | **1** |
| 계좌 목록 | `GET /api/v1/accounts` → `accounts ⋈ account_balances_v` | **1** |
| 월 결산 | `GET /api/v1/settlements/monthly?…` → `get_monthly_settlement(p_year, p_month)` | **1** |
| 예산(월) | `GET /api/v1/budgets/actuals?…` → `get_budget_actuals(p_year, p_month)` (계획+실적 롤업) | **1** |
| 연간 그리드 | `GET /api/v1/budgets/annual-grid?…` → `get_annual_grid(p_year, p_type, p_expense_kind)` | **1** |
| 자산 목록/포트폴리오 | `asset_values_v` (+ 카테고리 조인) | **1** |
| 투자 수익 요약 | `open_lots_v` + trades 집계 (필요 시 집계 RPC — DB.md에서 확정) | **1~2** |
| 예측 실행 | 입력 데이터 벌크 조회 1~2왕복 → **TS 순수 함수 계산** → 결과 반환 | **1~2** |

- Materialized view는 사용하지 않는다(수만 건 규모에서 일반 뷰 + 인덱스로 충분).
- 핵심 인덱스(상세 DDL은 DB.md): `(account_id, status) INCLUDE(type, amount)`, `(to_account_id, status) WHERE to_account_id IS NOT NULL`, `(date, type, status)`, FIFO 부분 인덱스 `WHERE trade_type='buy' AND remaining_quantity>0`.

---

## 6. 캐시 전략 (TanStack Query)

### 6.1 쿼리 키 팩토리 — `src/lib/query-keys.ts` 초안 (단일 정의, 문자열 키 직접 사용 금지)

```ts
// ym: 'YYYY-MM' — 월 단위 무효화의 기본 입자(granularity)
export const qk = {
  transactions: {
    all: ['transactions'] as const,
    list: (filter: TransactionFilter, page: number, limit: number) =>
      [...qk.transactions.all, 'list', filter, page, limit] as const,
    month: (ym: string) => [...qk.transactions.all, 'month', ym] as const,
    detail: (id: string) => [...qk.transactions.all, 'detail', id] as const,
  },
  accounts: {
    all: ['accounts'] as const,
    list: () => [...qk.accounts.all, 'list'] as const,        // accounts ⋈ account_balances_v
    detail: (id: string) => [...qk.accounts.all, 'detail', id] as const,
  },
  categories: {
    all: ['categories'] as const,
    list: (type?: 'income' | 'expense') => [...qk.categories.all, 'list', type ?? 'all'] as const,
  },
  tags: {
    all: ['tags'] as const,
    search: (q: string) => [...qk.tags.all, 'search', q] as const,
  },
  budgets: {
    all: ['budgets'] as const,
    list: (year: number) => [...qk.budgets.all, 'list', year] as const,
    detail: (id: string) => [...qk.budgets.all, 'detail', id] as const,
    actuals: (ym: string) => [...qk.budgets.all, 'actuals', ym] as const,   // get_budget_actuals
    annualGrid: (year: number) => [...qk.budgets.all, 'annual-grid', year] as const,
    summary: (year: number) => [...qk.budgets.all, 'summary', year] as const,
  },
  settlements: {
    all: ['settlements'] as const,
    monthly: (ym: string) => [...qk.settlements.all, 'monthly', ym] as const,
    annual: (year: number) => [...qk.settlements.all, 'annual', year] as const,
  },
  dashboard: {
    all: ['dashboard'] as const,
    month: (ym: string) => [...qk.dashboard.all, 'month', ym] as const,     // get_dashboard
  },
  assets: {
    all: ['assets'] as const,
    list: (filter?: AssetFilter) => [...qk.assets.all, 'list', filter ?? {}] as const,
    detail: (id: string) => [...qk.assets.all, 'detail', id] as const,
    valuations: (id: string) => [...qk.assets.all, 'valuations', id] as const,
    portfolio: () => [...qk.assets.all, 'portfolio'] as const,
  },
  assetCategories: {
    all: ['asset-categories'] as const,
    list: () => [...qk.assetCategories.all, 'list'] as const,
  },
  trades: {
    all: ['investment-trades'] as const,
    list: (filter: TradeFilter, page: number) => [...qk.trades.all, 'list', filter, page] as const,
    summary: (filter: TradeRangeFilter) => [...qk.trades.all, 'summary', filter] as const,
    tickers: (filter: TradeRangeFilter) => [...qk.trades.all, 'tickers', filter] as const,
    annual: (year: number) => [...qk.trades.all, 'annual', year] as const,
  },
  recurring: {
    all: ['recurring'] as const,
    list: () => [...qk.recurring.all, 'list'] as const,
    detail: (id: string) => [...qk.recurring.all, 'detail', id] as const,
  },
  forecast: {
    all: ['forecast'] as const,
    scenarios: () => [...qk.forecast.all, 'scenarios'] as const,
    results: (scenarioId: string) => [...qk.forecast.all, 'results', scenarioId] as const,
  },
  reports: {
    all: ['reports'] as const,
    trend: (from: string, to: string) => [...qk.reports.all, 'trend', from, to] as const,
    categories: (ym: string) => [...qk.reports.all, 'categories', ym] as const,
    netWorth: (months: number) => [...qk.reports.all, 'net-worth', months] as const,
  },
} as const
```

### 6.2 staleTime 정책

| 그룹 | staleTime | 근거 |
|---|---|---|
| categories, assetCategories, tags | 5분 | 변경 빈도 극히 낮음 |
| accounts.list, transactions.month | 30초 | 낙관적 업데이트가 즉시 반영하므로 refetch는 보정용 |
| dashboard, settlements, budgets.actuals | 30초 | 집계 RPC — 무효화로만 갱신 |
| reports.* | 5분 | 추이성 데이터, 정확도 요구 낮음 |
| forecast.results | Infinity | run 시에만 재계산 |

### 6.3 뮤테이션별 무효화 표 (광역 무효화 금지 — 해당 월/자원만)

`ym(date)` = 대상 거래 날짜의 'YYYY-MM'. update로 월이 바뀌면 **이전 월과 새 월 모두** 무효화.

| 뮤테이션 | 낙관적 업데이트(§7) | onSettled 무효화 키 |
|---|---|---|
| 거래 create | transactions.month(ym), accounts.list | transactions.month(ym) · accounts.list · dashboard.month(ym) · settlements.monthly(ym) · budgets.actuals(ym) |
| 거래 update | transactions.month(구·신 ym), transactions.detail(id), accounts.list | 위와 동일 (구 ym + 신 ym 각각) |
| 거래 delete | transactions.month(ym), accounts.list | 거래 create와 동일 |
| 계좌 create/update/delete | — | accounts.list · dashboard.month(현재 ym) (자산 연결 시 + assets.list) |
| 계좌 order | accounts.list (배열 재정렬) | accounts.list |
| 카테고리 CUD/order | — | categories.list · (예산 화면 열려있으면) budgets.annualGrid(연도) |
| 예산 create/update/delete | — | budgets.list(year) · budgets.detail(id) · budgets.actuals(ym) · budgets.summary(year) · dashboard.month(ym) |
| 예산 copy | — | budgets.list(targetYear) · budgets.actuals(target ym) · budgets.summary(targetYear) |
| 연간 그리드 cell | budgets.annualGrid(year) 셀 즉시 반영 | budgets.annualGrid(year) · budgets.actuals(ym) · budgets.summary(year) |
| 자산 CUD / 평가 추가 | — | assets.list · assets.detail(id) · assets.valuations(id) · assets.portfolio · reports.netWorth |
| 자산카테고리 CUD | — | assetCategories.list · assets.list |
| 매매 create/delete | trades.list(해당 필터) | trades.all(하위 전체: list·summary·tickers·annual) · assets.detail(assetId) · accounts.list(연결 계좌 시) · dashboard.month(ym) |
| 정기거래 CUD | — | recurring.list |
| 정기거래 process | — | recurring.list · transactions.month(생성된 월들) · dashboard.month(현재 ym) |
| 시나리오 CUD / run | — | forecast.scenarios · forecast.results(scenarioId) |

- **reports.*는 뮤테이션에서 무효화하지 않는다** — staleTime 경과 후 refetchOnWindowFocus로 자연 갱신(무거운 리페치 연쇄 차단).
- 매매는 로트 연쇄(FIFO) 때문에 예외적으로 `trades.all` 프리픽스 무효화를 허용한다.

---

## 7. 낙관적 업데이트 규칙 (어떤 캐시에 어떤 delta)

**공통 프로토콜** (`useMutation` 표준형):

1. `onMutate`: 대상 키 `cancelQueries` → `getQueryData` 스냅샷 → `setQueryData`로 delta 적용 → 스냅샷을 context로 반환
2. `onError`: context 스냅샷 전량 복원 + 에러 토스트(사용자 가시 피드백 필수)
3. `onSettled`: §6.3 표의 키 invalidate (서버 진실로 수렴)

**거래 잔액 delta 규칙** (`accounts.list` 캐시의 `balance` 필드에 적용):

| 거래 유형 | accountId | toAccountId |
|---|---|---|
| income | `+amount` | — |
| expense (일반 소비) | `−amount` | — |
| expense + toAccountId (저축 거래) | `−amount` | `+amount` |
| transfer | `−amount` | `+amount` |

- **create**: 위 delta 적용 + `transactions.month(ym)` 목록 맨 앞에 임시 row 삽입(`id: 'optimistic-' + crypto.randomUUID()`, 정렬 위치는 date 기준). 임시 row는 서버 응답으로 교체되기 전까지 수정/삭제 버튼 비활성.
- **update**: `이전 거래의 역(−)delta` + `새 값의 delta`를 순차 적용. 목록에서는 해당 row를 새 값으로 치환(월 이동 시 구 월 목록에서 제거, 신 월은 무효화에 맡김).
- **delete**: 역delta 적용 + 목록에서 row 제거.
- **dashboard/결산/예산 실적 캐시에는 delta를 적용하지 않는다** — 집계 구조가 복잡해 오차 위험이 크므로 무효화로만 갱신. 낙관적 반영 대상은 `transactions.month`와 `accounts.list` 2개로 한정한다.
- **매매 create**: `trades.list` 목록 삽입만 낙관적으로 처리. realized_gain·로트 변화는 서버 계산 결과를 기다린다(FIFO는 클라이언트 재현 금지).
- 페이지네이션된 `transactions.list`(필터 검색 화면)는 낙관적 삽입 대상에서 제외 — 무효화만.

---

## 8. Supabase 연결 설정

```ts
// src/server/db.ts
import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL!, {  // transaction-mode pooler, 포트 6543
  prepare: false,        // 필수: transaction pooler는 prepared statement 미지원
  max: 1,                // 서버리스 함수 인스턴스당 1 (pooler가 다중화 담당)
  idle_timeout: 20,
  connect_timeout: 10,
})
```

| 항목 | 값 | 이유 |
|---|---|---|
| 포트 | **6543** (transaction-mode pooler, Supavisor) | 서버리스 다수 인스턴스의 커넥션 고갈 방지 |
| `prepare` | **false** | transaction pooler에서 prepared statement 오류 방지 |
| Vercel 리전 | **Supabase 프로젝트 리전과 일치** (예: 둘 다 `ap-northeast-2`) — `vercel.json`의 `regions`로 고정 | 왕복 RTT 절반 이하 |
| 마이그레이션/관리 접속 | 5432 direct (CI·로컬 전용) | DDL은 pooler 경유 금지 |
| 환경변수 | `DATABASE_URL`(pooler), `DIRECT_URL`(direct), `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`(서버 전용) | 시크릿은 Vercel env, 코드 하드코딩 금지 |

인증: Supabase 이메일 인증. 라우트 핸들러는 `@supabase/ssr` 쿠키 세션 검증(로컬 JWT 검증, DB 왕복 없음). 모든 테이블 RLS 활성(단일 사용자여도 `auth.uid()` 스코프), RPC는 `SECURITY INVOKER` 기본 — 상세는 DB.md.

**인가 경계 (확정)**: 실질 인가 경계는 `guarded()`(`src/server/api-guard.ts`) — 세션 검증(401) + `OWNER_EMAIL` 소유자 이메일 검증(불일치 403, 미설정 시 전 요청 거부 fail-closed). RLS는 PostgREST/anon 노출 표면 방어 계층이며, 앱의 postgres.js 직결 경로에는 적용되지 않는다(테이블 소유자 롤) — 이는 의식적 아키텍처 결정이다(DB.md §5). 보조 가드: 프로덕션 기동 시 접속 롤이 슈퍼유저면 즉시 실패(`src/server/db/role-guard.ts`).

보안 헤더: `next.config.ts` `headers()`로 전 라우트에 HSTS·`X-Content-Type-Options`·`X-Frame-Options`·`Referrer-Policy`·`Permissions-Policy` 적용(SEC-H2). **CSP는 후속 이슈** — Next.js 스크립트 nonce 구성(미들웨어 기반 per-request nonce)이 필요해 별도 트랙으로 분리한다.

---

## 9. pg_cron 잡 목록

| 잡 이름 | 스케줄 (UTC) | 호출 | 역할 |
|---|---|---|---|
| `process_recurring_daily` | `5 15 * * *` (KST 00:05) | `process_due_transactions()` | 정기거래 실행분 생성 + 향후 12개월 pending 유지(월말/윤년 보정 규칙 준수) |
| `snapshot_asset_values_daily` | `10 15 * * *` (KST 00:10) | `snapshot_asset_valuations()` | `asset_values_v` 기준 일일 평가 스냅샷 적재(순자산 추이 이력용) |
| `cleanup_stale_pending_monthly` | `0 16 1 * *` (KST 매월 1일 01:00) | `cleanup_stale_pending()` | 종료된 정기거래의 미래 pending 정리 |

- 함수 시그니처·본문은 DB.md에서 확정.
- **온디맨드 보정**: cron 미스(프로젝트 일시정지 등) 대비, 앱 접속 시 클라이언트가 `POST /api/v1/recurring/process`를 1회 호출(멱등 — 이미 처리된 날짜는 no-op).
- 기존 `/api/cron/process-recurring`(Vercel Cron)은 폐지하고 pg_cron으로 이관.

---

## 10. 테스트 계층 구조

| 계층 | 위치 | 도구 | 대상 · 방식 |
|---|---|---|---|
| 단위 | `tests/unit` | Vitest | 이자 계산기, 월말/윤년 보정, 예측, FIFO TS 레퍼런스 — 순수 함수 |
| DB 통합 | `tests/integration` | Vitest + 로컬 Supabase(`supabase start`) | RPC·뷰를 **블랙박스**로: 테스트가 먼저 `callRpc('create_transaction', …)` 호출 → `account_balances_v` 등 assert → 그다음 migration SQL 작성 (TDD가 SQL로 내려감) |
| DB 제약 | `supabase/tests` | pgTAP (`supabase test db`) | CHECK/UNIQUE/인덱스 존재/함수 시그니처 회귀 방지 |
| 교차 검증 | `tests/cross` | Vitest (property-based, fast-check) | 랜덤 매매 시퀀스: TS FIFO 레퍼런스 결과 == `create/delete_investment_trade` RPC 결과 |
| E2E | `tests/e2e` | Playwright | 저장→잔액 반영, 결산, 예산, 매도→실현손익. **저장 지연 어설션**: 로컬 50ms / 프로덕션 스모크 500ms(p95) |

- 커버리지 게이트 80% 이상(`pnpm test:coverage`).
- 통합 테스트 격리: 테스트 파일당 트랜잭션 롤백 또는 `supabase db reset` 스냅샷.
- 2C(투자) 트랙은 기존 앱의 FIFO 결과 스냅샷을 fixture로 사용해 회귀 방지.

---

## 11. CI 파이프라인 (GitHub Actions)

```text
push / PR (rebuild/v2, main)
  │
  ├─ job: static ──────────── pnpm lint → pnpm tsc --noEmit
  │
  ├─ job: test ────────────── supabase start (로컬 스택)
  │                           → supabase db reset (migrations + seed 적용)
  │                           → supabase test db            (pgTAP)
  │                           → pnpm test:coverage          (unit + integration + cross, 80% 게이트)
  │
  ├─ job: build ───────────── pnpm build (Next.js 프로덕션 빌드)
  │
  └─ job: e2e (test·build 이후) ─ supabase start → pnpm build → playwright test
                                  (저장 지연 어설션 포함, 아티팩트: trace/screenshot 업로드)
  ▼
  merge 조건: 전 job green + 커버리지 80%+ + 리뷰 CRITICAL/HIGH 0건
  ▼
  Vercel 배포 (리전 고정) → 프로덕션 스모크(Playwright): 거래 저장 p95 <500ms, Lighthouse 모바일 90+
```

- 마이그레이션은 `supabase/migrations` SQL이 단일 진실 — CI에서 매번 빈 DB에 전체 적용해 재현성 보장. Drizzle은 타입·쿼리빌더 용도로 병행(introspect).
- 프로덕션 마이그레이션: `supabase db push`를 배포 파이프라인의 수동 승인 스텝으로 분리.
