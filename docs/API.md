# Cashflow REST API v1 명세

> Base URL: `/api/v1`. 아키텍처 배경은 [ARCHITECTURE.md](./ARCHITECTURE.md), RPC·뷰의 상세 시그니처는 [DB.md](./DB.md) 참조 — 본 문서는 RPC/뷰의 **이름과 파라미터만** 언급한다.
> 총 **67개 엔드포인트 / 14개 자원**. 기존 42개 라우트 파일의 기능을 전부 커버한다(§17 매핑표).

## 목차

1. [공통 규약](#1-공통-규약)
2. [Transactions 거래](#2-transactions)
3. [Accounts 계좌](#3-accounts)
4. [Categories 카테고리](#4-categories)
5. [Tags 태그](#5-tags)
6. [Budgets 예산](#6-budgets)
7. [Settlements 결산](#7-settlements)
8. [Dashboard 대시보드](#8-dashboard)
9. [Assets 자산](#9-assets)
10. [Asset Categories 자산 카테고리](#10-asset-categories)
11. [Investment Trades 투자 매매](#11-investment-trades)
12. [Recurring 정기거래](#12-recurring)
13. [Forecast 예측](#13-forecast)
14. [Reports 보고서](#14-reports)
15. [Export 내보내기](#15-export)
16. [에러 코드 일람](#16-에러-코드-일람)
17. [기존 42개 라우트 → v1 매핑](#17-기존-42개-라우트--v1-매핑)

---

## 1. 공통 규약

### 1.1 응답 envelope (전 엔드포인트 공통)

```ts
// 성공
{ success: true, data: T }
// 실패
{ success: false, error: { code: string, message: string } }
```

- CSV 다운로드(§15)만 예외적으로 raw body를 반환한다.

### 1.2 인증

- 모든 `/api/v1/**`는 Supabase 세션 필수(`@supabase/ssr` 쿠키). 미인증 → `401 UNAUTHORIZED`.
- 향후 Android: `Authorization: Bearer <supabase_access_token>` 헤더 동일 검증.

### 1.3 공통 타입 규칙

| 항목 | 규칙 |
|---|---|
| id | `uuid` 문자열 |
| 금액 | KRW 정수(`bigint`, JSON number). 소수점 금지. 수량(quantity)만 소수 허용 |
| 날짜 | `YYYY-MM-DD` 문자열 / 월 지정 파라미터는 `year=YYYY&month=M` 정수 쌍 (보고서 추이 §14.1의 `from`/`to`만 `YYYY-MM`) |
| 타임스탬프 | ISO 8601 (`createdAt`, `updatedAt` — 모든 엔티티 응답에 포함, 이하 개별 표기 생략) |
| 페이지네이션 응답 | `{ items: T[], total: number, page: number, limit: number }` (기본 `page=1`, `limit=20`, 최대 100) |
| 캐시 헤더 | 무거운 GET(결산·보고서·연간 그리드·요약)은 `Cache-Control: private, max-age=60, stale-while-revalidate=300` |

### 1.4 검증

요청 본문은 라우트 핸들러 진입 즉시 Zod로 검증(`src/lib/validators/*`, 본 문서의 본문 스키마와 1:1). 실패 시 `400 VALIDATION_ERROR`(message에 첫 issue).

### 1.5 상태 코드 관례

`200` 조회/수정/삭제 성공 · `201` 생성 · `400` 검증 실패 · `401` 미인증 · `404` 없음 · `409` 충돌 · `422` 도메인 규칙 위반 · `500` 서버 오류.

---

## 2. Transactions

거래(수입/지출/이체). **저축 거래** = `type='expense'` + `toAccountId` 지정 + 카테고리 `expenseKind='saving'` — 예산·결산에 포함된다(도메인 규칙, commit 9c2dffd 회귀 방지).
새 태그는 거래 RPC 내부 upsert로 즉시 생성된다(태그 자동완성은 `GET /tags` 검색 + 신규명 그대로 제출 — 별도 태그 생성 API 없음).

### 2.1 `GET /api/v1/transactions` — 거래 목록

| 쿼리 | 타입 | 설명 |
|---|---|---|
| `type` | `income \| expense \| transfer` | 선택 |
| `categoryId`, `accountId` | uuid | 선택 |
| `tags` | string (쉼표 구분 태그명) | 선택, OR 매칭 |
| `search` | string | description/memo 부분 일치 |
| `from`, `to` | date | 기간 (둘 중 하나만도 허용) |
| `page`, `limit` | int | 기본 1 / 20 |

**응답** `200`: `{ items: Transaction[], total, page, limit }`

```ts
Transaction = {
  id: uuid, type: 'income'|'expense'|'transfer',
  amount: number, description: string, date: 'YYYY-MM-DD',
  categoryId: uuid|null, category: { id, name, icon, color, expenseKind }|null,
  accountId: uuid, account: { id, name, type },
  toAccountId: uuid|null, toAccount: { id, name, type }|null,
  memo: string|null, tags: { id, name, color }[],
  installmentMonths: number|null, installmentCurrent: number|null,
  status: 'applied'|'pending', recurringId: uuid|null,
}
```

**구현 메모**: 거래+카테고리+계좌+태그(jsonb_agg) 조인 SELECT 1문 + `count(*) over()` — 1왕복.

### 2.2 `POST /api/v1/transactions` — 거래 생성

**본문** (Zod `createTransactionSchema`):

```ts
{
  type: 'income'|'expense'|'transfer',
  amount: number,                    // int, > 0
  description: string,               // 1~200자
  categoryId?: uuid|null,
  accountId: uuid,
  toAccountId?: uuid|null,
  date: 'YYYY-MM-DD',
  memo?: string|null,                // ≤500자
  tags?: string[],                   // 태그명 배열 (없으면 생성)
  installmentMonths?: number|null,   // 2~60
  installmentCurrent?: number|null,  // ≥1
}
// refine: transfer → toAccountId 필수·accountId와 상이
// refine: expense + toAccountId(저축) → categoryId 필수
```

**응답** `201`: `{ success: true, data: Transaction }` (태그 포함, 재조회 없음)

**에러**: `400 VALIDATION_ERROR` · `404 NOT_FOUND`(계좌/카테고리) · `422 SAVING_CATEGORY_REQUIRED`

**구현 메모**: RPC `create_transaction(p_payload jsonb)` 1왕복 — INSERT + 태그 unnest upsert + junction, RETURNS jsonb.

### 2.3 `GET /api/v1/transactions/{id}` — 거래 단건

**응답** `200 Transaction` / `404 NOT_FOUND`. **구현 메모**: 2.1과 동일 조인 SELECT 1왕복.

### 2.4 `PATCH /api/v1/transactions/{id}` — 거래 수정

**본문**: 2.2의 partial (모든 필드 optional, `amount`는 있으면 양수). **응답** `200 Transaction`.

**구현 메모**: RPC `update_transaction(p_id uuid, p_payload jsonb)` 1왕복 — UPDATE + 태그 diff. 잔액 역계산 없음(파생).

### 2.5 `DELETE /api/v1/transactions/{id}` — 거래 삭제

**응답** `200`: `{ success: true, data: { id } }` / `404`.

**구현 메모**: RPC `delete_transaction(p_id uuid)` 1왕복 — DELETE 한 문장(태그 junction FK CASCADE).

---

## 3. Accounts

계좌/카드. `balance`는 저장 컬럼이 아니라 **뷰 파생값**(initial_balance + Σ거래효과 + Σ매매효과).

### 3.1 `GET /api/v1/accounts` — 계좌 목록 (잔액 포함)

쿼리 없음. **응답** `200: Account[]` (sortOrder 순)

```ts
Account = {
  id: uuid, name: string, type: 'cash'|'bank'|'card'|'savings'|'investment',
  balance: number,                   // account_balances_v 파생 (읽기 전용)
  initialBalance: number,
  color: string|null, icon: string|null, sortOrder: number,
  // 적금(savings) 전용
  depositType: 'lump_sum'|'installment'|null, termMonths: number|null,
  interestRate: number|null, taxType: 'normal'|'preferential'|'tax_free'|'high'|null,
  openDate: date|null, monthlyPayment: number|null,
  // 카드(card) 전용
  billingDay: number|null,           // 1~31
  creditLimit: number|null, linkedAccountId: uuid|null,
  assetId: uuid|null,                // 자산 연결
}
```

**구현 메모**: `accounts ⋈ account_balances_v` 1왕복. 만기 D-day·이자·카드 미결제금은 클라이언트 순수 함수(`lib/calculations`) 계산.
카드 부호 규칙: 카드(type='card') 계좌의 `balance`는 **음수가 미결제금**을 의미한다(미결제금 = |음수 잔액|, 양수 잔액 = 선결제 크레딧 — DB.md §2.1).

### 3.2 `POST /api/v1/accounts` — 계좌 생성

**본문** (Zod `createAccountSchema`): `{ name(1~100), type, balance?=0(→initialBalance), color?, icon?, depositType?, termMonths?, interestRate?, taxType?, openDate?, monthlyPayment?, assetId?, billingDay?(1~31), creditLimit?, linkedAccountId? }`

**응답** `201 Account`. **구현 메모**: 단문 INSERT … RETURNING 1왕복.

### 3.3 `GET /api/v1/accounts/{id}` — 단건 (잔액 포함) — `200 Account` / `404`

### 3.4 `PATCH /api/v1/accounts/{id}` — 수정

**본문**: 3.2 partial + `initialBalance?`(잔액 보정은 initialBalance 수정 또는 보정 거래로만 — 파생 balance 직접 수정 불가). **응답** `200 Account`.

### 3.5 `DELETE /api/v1/accounts/{id}` — 삭제

**응답** `200 { id }`. **에러**: `409 REFERENCE_EXISTS` — 거래/매매가 참조 중이면 삭제 거부(FK RESTRICT).

### 3.6 `PATCH /api/v1/accounts/order` — 드래그 정렬 일괄 저장

**본문**: `{ items: { id: uuid, sortOrder: number }[] }` **응답** `200 { updated: number }`

**구현 메모**: `unnest` 배열 조인 단일 UPDATE 1왕복 (per-row 루프 금지).

---

## 4. Categories

수입/지출 카테고리, 대·소분류 2단계 트리. 예산 롤업 키 = `COALESCE(parent_id, id)`.

### 4.1 `GET /api/v1/categories` — 목록

| 쿼리 | 설명 |
|---|---|
| `type` | `income \| expense` 선택 |
| `grouped` | `true`면 대분류 아래 children 중첩 트리로 반환 |

**응답** `200: Category[]` 또는 grouped 시 `(Category & { children: Category[] })[]`

```ts
Category = { id, name, type: 'income'|'expense',
  expenseKind: 'consumption'|'saving'|null, icon: string|null,
  color: string|null, parentId: uuid|null, sortOrder: number }
```

**구현 메모**: 전체 SELECT 1왕복, 트리 조립은 서비스 계층.

### 4.2 `POST /api/v1/categories` — 생성

**본문** (Zod `createCategorySchema`): `{ name(1~50), type, expenseKind?, icon?, color?, parentId?, sortOrder? }` **응답** `201 Category`. **에러**: `422 MAX_DEPTH_EXCEEDED`(3단계 이상 금지).

### 4.3 `PATCH /api/v1/categories/{id}` — 수정 (본문 4.2 partial, 미전달 필드 보존) — `200 Category`

### 4.4 `DELETE /api/v1/categories/{id}` — 삭제 — `200 { id }` / `409 REFERENCE_EXISTS`(거래·예산 참조 시)

### 4.5 `PATCH /api/v1/categories/order` — 드래그 재정렬

**본문/응답/구현**: 3.6과 동일 패턴(`unnest` 단일 UPDATE).

---

## 5. Tags

### 5.1 `GET /api/v1/tags` — 태그 목록/자동완성

| 쿼리 | 설명 |
|---|---|
| `q` | 부분 일치 검색(자동완성). 있으면 이름순 최대 20건, 없으면 최근 생성순 최대 100건 |

**응답** `200: { id, name, color }[]`

**구현 메모**: tags SELECT 1왕복. 태그 생성/연결은 거래 RPC 내부에서만(별도 쓰기 API 없음), 고아 태그는 표시 안 함.

---

## 6. Budgets

예산. `totalIncome/totalExpense` 저장 컬럼 제거 — 실적·합계는 `get_budget_actuals` / `budget_totals_v` 파생. 실적 집계는 `status='applied'` 거래만, 저축 거래 포함, 대분류 롤업.

### 6.1 `GET /api/v1/budgets` — 예산 목록

| 쿼리 | 설명 |
|---|---|
| `year` | 필수. 해당 연도 월별+연간 예산 |

**응답** `200: BudgetSummaryItem[]` — `{ id, name, year, month: number|null, itemCount, plannedTotal }`

**구현 메모**: `budgets ⋈ budget_totals_v` 1왕복.

### 6.2 `POST /api/v1/budgets` — 예산 생성 (items 포함)

**본문** (Zod `createBudgetSchema`):

```ts
{ name: string, year: number, month?: number|null,  // null = 연간 예산
  memo?: string|null,
  items?: { categoryId: uuid, plannedAmount: number, memo?: string|null }[] }
```

**응답** `201 Budget(items 포함)`. **에러**: `409 DUPLICATE_BUDGET`(동일 year+month 존재).

**구현 메모**: RPC `create_budget(p_payload jsonb)` 1왕복(budget + items 배치 INSERT 원자 처리).

### 6.3 `GET /api/v1/budgets/{id}` — 예산 상세 (계획 + 실적)

**응답** `200`:

```ts
{ id, name, year, month, memo,
  items: { id, categoryId, category: {...}, plannedAmount, actualAmount, memo }[],
  plannedTotal: number, actualTotal: number }
```

**구현 메모**: RPC `get_budget_actuals(p_year, p_month)`와 items 조인 — 1왕복.

### 6.4 `PATCH /api/v1/budgets/{id}` — 수정 (`{ name?, memo?, items? }` — items 전달 시 전량 교체) — `200 Budget`

**구현 메모**: RPC `update_budget(p_id, p_payload jsonb)` 1왕복(items diff 원자 처리).

### 6.5 `DELETE /api/v1/budgets/{id}` — 삭제 — `200 { id }` (items CASCADE)

### 6.6 `POST /api/v1/budgets/copy` — 전월 복사

**본문** (Zod `copyBudgetSchema`): `{ sourceYear, sourceMonth, targetYear, targetMonth }`

**응답** `201 Budget`. **에러**: `404 NOT_FOUND`(원본 없음) · `409 DUPLICATE_BUDGET`(대상 존재).

**구현 메모**: RPC `copy_budget(...)` 1왕복 — INSERT … SELECT.

### 6.7 `GET /api/v1/budgets/actuals` — 월 예산 대비 실적

| 쿼리 | 설명 |
|---|---|
| `year`, `month` | 필수 |

**응답** `200`: `{ categories: { categoryId, categoryName, planned, actual, ratio }[], plannedTotal, actualTotal }`

**구현 메모**: RPC `get_budget_actuals(p_year, p_month)` 1왕복 (대시보드 예산 위젯과 예산 페이지 공용).

### 6.8 `GET /api/v1/budgets/annual-grid` — 연간 그리드 (12개월 × 카테고리)

| 쿼리 | 설명 |
|---|---|
| `year` | 필수 |
| `type` | `income \| expense` 선택 |
| `expenseKind` | `consumption \| saving` 선택 |

**응답** `200`: `{ rows: { categoryId, categoryName, months: number[12], total }[], monthTotals: number[12], grandTotal }`

**구현 메모**: RPC `get_annual_grid(p_year, p_type, p_expense_kind)` 1왕복 (DB.md §3.12와 동일 명칭 — `type`/`expenseKind` 쿼리가 각각 `p_type`/`p_expense_kind`로 전달, 생략 시 NULL). `Cache-Control` 부여.

### 6.9 `PUT /api/v1/budgets/annual-grid/cell` — 그리드 셀 upsert

**본문** (Zod `updateAnnualGridCellSchema`): `{ year, month(1~12), categoryId, amount(≥0) }`

**응답** `200 { budgetId, itemId, amount }`

**구현 메모**: RPC `upsert_budget_cell(...)` 1왕복 — 해당 월 예산·item이 없으면 생성(upsert), 원자 처리.

### 6.10 `GET /api/v1/budgets/summary` — 연간 개요 (차트용)

| 쿼리 | 설명 |
|---|---|
| `year` | 필수 (2000~2100) |

**응답** `200`: `{ months: { month, plannedIncome, plannedExpense, actualIncome, actualExpense }[12] }`

**구현 메모**: 연간 집계 RPC(파라미터 `p_year` — 이름은 DB.md에서 확정) 1왕복. `Cache-Control` 부여.

---

## 7. Settlements

결산. 저장하지 않고 매 요청 시 집계(파생) — 캐시 헤더로 완화.

### 7.1 `GET /api/v1/settlements/monthly` — 월 결산

| 쿼리 | 설명 |
|---|---|
| `year`, `month` | 필수 |

**응답** `200`:

```ts
{ income: { total, byCategory: { categoryId, name, amount, ratio }[] },
  expense: { total, byCategory: [...], consumptionTotal, savingTotal },  // 저축 거래 포함
  net: number,
  accounts: { accountId, name, openingBalance, closingBalance, change }[],
  momComparison: { incomeDiff, expenseDiff, netDiff } }                  // 전월 대비
```

**구현 메모**: RPC `get_monthly_settlement(p_year, p_month)` 1왕복 (기존 settlement-service SQL이 검증된 원형).

### 7.2 `GET /api/v1/settlements/annual` — 연간 결산

| 쿼리 | 설명 |
|---|---|
| `year` | 필수 |

**응답** `200`: `{ months: { month, income, expense, saving, net }[12], byCategory: [...], total: {...} }`

**구현 메모**: 연간 결산 RPC(파라미터 `p_year` — 이름은 DB.md에서 확정) 1왕복. 월 12회 호출 금지.

---

## 8. Dashboard

### 8.1 `GET /api/v1/dashboard?year=YYYY&month=M` — 대시보드 전체 (1왕복)

| 쿼리 | 설명 |
|---|---|
| `year` | `YYYY` 정수, 기본 = 현재 연도 |
| `month` | `1~12` 정수, 기본 = 현재 월 |

**응답** `200`:

```ts
{ netWorth: number,                                 // 자산 미연동 계좌 잔액 + 자산 평가액 합
  totalBalance: number, accountCount: number,       // 총잔액 카드 (활성 계좌 전체)
  investment: {                                     // 투자 요약 위젯 — 자산 없으면 null
    totalValue,                                     //   활성 자산 평가액 합 (asset_values_v)
    invested, sold, dividend, realizedGain },       //   해당 월 매수/매도/배당/실현손익
  monthlyIncome: number, monthlyExpense: number,    // 월 수입/지출 카드
  dailyTotals: { date, income, expense }[],         // 거래 캘린더 (해당 월 전체)
  budget: {                                         // 예산 소진율 위젯 — 해당 월 예산 없으면 null
    plannedTotal, actualTotal, ratio },
  recentTransactions: Transaction[] }               // 최근 5건
```

**구현 메모**: RPC `get_dashboard(p_year, p_month)` **1왕복** (DB.md §3.9와 파라미터 일치) — 기존 `/dashboard` + `/dashboard/daily-totals` 2개 API·5쿼리를 단일 jsonb 반환으로 흡수.

---

## 9. Assets

자산(금융/비금융). `currentValue` 저장 컬럼 제거 — `asset_values_v` 파생(최신 평가이력 + 연동 계좌/매매 반영).

### 9.1 `GET /api/v1/assets` — 자산 목록

| 쿼리 | 설명 |
|---|---|
| `kind` | `financial \| non_financial` 선택 |
| `activeOnly` | `true` 기본 — 비활성 포함 시 `false` |

**응답** `200: Asset[]`

```ts
Asset = { id, name, assetCategoryId, assetCategory: { id, name, kind, icon, color },
  acquisitionDate: date, acquisitionCost: number,
  currentValue: number,              // asset_values_v 파생 (읽기 전용)
  gain: number, gainRate: number,    // 파생
  institution: string|null, memo: string|null, isActive: boolean,
  metadata: Record<string, unknown>|null }
```

**구현 메모**: `assets ⋈ asset_values_v ⋈ asset_categories` 1왕복.

### 9.2 `POST /api/v1/assets` — 생성

**본문** (Zod `createAssetSchema`): `{ name(1~100), assetCategoryId, acquisitionDate, acquisitionCost(≥0), initialValue?(≥0, 최초 평가이력으로 기록), institution?, memo?, isActive?=true, metadata? }`
(구 스키마의 `currentValue` 입력은 최초 평가이력 1건으로 변환)

**응답** `201 Asset`. **구현 메모**: RPC `create_asset(p_payload jsonb)` 1왕복 — asset INSERT + 최초 valuation INSERT 원자.

### 9.3 `GET /api/v1/assets/{id}` — 자산 상세

**응답** `200`: `Asset & { valuations: Valuation[], linkedAccounts: { id, name, type, balance }[] }` — 상세 화면 1왕복.

### 9.4 `PATCH /api/v1/assets/{id}` — 수정 (9.2 partial, 평가값 변경은 §9.7로) — `200 Asset`

### 9.5 `DELETE /api/v1/assets/{id}` — 삭제 — `200 { id }` / `409 REFERENCE_EXISTS`(계좌·매매 참조 시)

### 9.6 `GET /api/v1/assets/portfolio` — 포트폴리오 (도넛 차트)

**응답** `200`: `{ total: number, byCategory: { assetCategoryId, name, kind, color, value, ratio }[] }`

**구현 메모**: `asset_values_v` 카테고리 GROUP BY 1왕복.

### 9.7 자산 평가 이력

- `GET /api/v1/assets/{id}/valuations` → `200: Valuation[]` — `{ id, date, value, source: 'manual'|'api'|'estimate'|'auto', memo }` (차트용, 날짜 오름차순)
- `POST /api/v1/assets/{id}/valuations` — **본문** (Zod `createValuationSchema`): `{ date, value(≥0), source?='manual', memo? }` → `201 Valuation` (동일 날짜 존재 시 upsert)

**구현 메모**: 단문 SELECT / INSERT … ON CONFLICT 각 1왕복. `source='auto'`는 pg_cron 스냅샷 전용.

---

## 10. Asset Categories

### 10.1 `GET /api/v1/asset-categories` — 목록 — `200: AssetCategory[]` (`{ id, name, kind: 'financial'|'non_financial', icon, color, sortOrder }`)

### 10.2 `POST /api/v1/asset-categories` — 생성

**본문** (Zod `createAssetCategorySchema`): `{ name(1~50), kind, icon?, color?, sortOrder?=0 }` → `201`

### 10.3 `PATCH /api/v1/asset-categories/{id}` — 수정 (partial) — `200`

### 10.4 `DELETE /api/v1/asset-categories/{id}` — 삭제 — `200 { id }` / `409 REFERENCE_EXISTS`(자산 참조 시)

**구현 메모**: 전부 단문 CRUD 1왕복.

---

## 11. Investment Trades

투자 매매(매수/매도/배당). FIFO 로트 상태는 RPC 내부에서만 변경 — **일반 UPDATE 금지**. 금액 필드 수정이 필요하면 삭제 후 재등록(클라이언트 UX로 안내).

### 11.1 `GET /api/v1/investment-trades` — 매매 목록

| 쿼리 | 설명 |
|---|---|
| `assetId` | 선택 |
| `from`, `to` | 기간 선택 |
| `page`, `limit` | 기본 1 / 20 |

**응답** `200`: `{ items: Trade[], total, page, limit }`

```ts
Trade = { id, assetId, asset: { id, name }, tradeType: 'buy'|'sell'|'dividend',
  date: date, ticker: string|null, quantity: number, unitPrice: number,
  totalAmount: number, fee: number, tax: number, netAmount: number,
  remainingQuantity: number|null,    // buy만 (FIFO 로트 잔량)
  realizedGain: number|null,         // sell만 (FIFO 계산 결과)
  memo: string|null, accountId: uuid|null }
```

### 11.2 `POST /api/v1/investment-trades` — 매매 생성 (FIFO)

**본문** (Zod `createInvestmentTradeSchema`):

```ts
{ assetId: uuid, tradeType: 'buy'|'sell'|'dividend', date: date,
  ticker?: string|null,              // ≤20자
  quantity: number,                  // > 0, 소수 허용
  unitPrice: number, totalAmount: number,   // int ≥ 0
  fee?: number = 0, tax?: number = 0, netAmount: number,
  memo?: string|null, accountId?: uuid|null }  // 연결 계좌 (잔액 파생에 반영)
```

**응답** `201 Trade` (sell이면 `realizedGain` 포함)

**에러**: `422 INSUFFICIENT_HOLDINGS` — 매도 수량 > 해당 ticker 보유 잔량.

**구현 메모**: RPC `create_investment_trade(p_payload jsonb)` 1왕복 — 매도 시 로트 `FOR UPDATE` 잠금 + 시간순 FIFO 차감 + realized_gain 계산.

### 11.3 `GET /api/v1/investment-trades/{id}` — 단건 — `200 Trade` / `404`

### 11.4 `PATCH /api/v1/investment-trades/{id}` — 메모만 수정

**본문**: `{ memo: string|null }` — **FIFO 영향 필드(금액·수량·유형·날짜)는 수정 불가**(전달 시 `422 IMMUTABLE_TRADE_FIELD`). **응답** `200 Trade`.

### 11.5 `DELETE /api/v1/investment-trades/{id}` — 삭제 (역FIFO)

**응답** `200 { id }`

**에러**: `409 TRADE_HAS_DEPENDENTS` — 매수 삭제 시 그 로트를 소비한 매도가 존재(매도 먼저 삭제 안내).

**구현 메모**: RPC `delete_investment_trade(p_id uuid)` 1왕복 — 매도 삭제 시 역FIFO로 로트 잔량 복원.

### 11.6 `GET /api/v1/investment-trades/summary` — 수익 요약 (기간별)

| 쿼리 | 설명 |
|---|---|
| `assetId` | 선택 |
| `from`, `to` | 기간 선택 |

**응답** `200`: `{ totalBuy, totalSell, realizedGain, dividendIncome, feeTotal, taxTotal, netProfit, returnRate }`

**구현 메모**: RPC `get_investment_summary(p_scope /* 'all'|'month'|'year' */, p_year, p_month)` 1왕복 (DB.md §3.13) — `from`/`to` 조합은 scope로 매핑해 전달. 자산별 총매수/총매도/배당/실현손익/수익률을 open_lots_v 기반으로 집계, 모든 매매 기록 포함(커밋 76da628 회귀 방지).

### 11.7 `GET /api/v1/investment-trades/tickers` — 종목별 상세 (보유/매도완료)

| 쿼리 | 설명 |
|---|---|
| `assetId`, `from`, `to` | 선택 |

**응답** `200`: `{ holding: TickerRow[], closed: TickerRow[] }`

```ts
TickerRow = {
  ticker: string,            // 종목 식별자 (티커)
  name: string,              // 종목 표시명 (연결 자산명)
  quantity: number,          // 보유 수량 (open_lots_v Σ remaining_quantity, closed는 0)
  avgBuyPrice: number,       // 평균 단가 (보유: 잔여 원가/보유 수량, closed: 총매수액/총매수 수량)
  totalBuyAmount: number,    // 총매수액 (Σ total_amount, buy)
  totalSellAmount: number,   // 총매도액 (Σ net_amount, sell)
  dividendIncome: number,    // 배당 누계
  realizedGain: number,      // 실현손익 누계 (FIFO)
  returnRate: number,        // 수익률(%) = (실현손익 + 배당) / 총매수액 × 100
  trades: Trade[],           // 거래내역 배열 (§11.1 Trade, date DESC)
}
```

**구현 메모**: `open_lots_v` + trades 집계 1~2왕복.

### 11.8 `GET /api/v1/investment-trades/annual` — 연간 월별 요약

| 쿼리 | 설명 |
|---|---|
| `year` | 필수 |

**응답** `200`: `{ months: { month, investedAmount, dividendIncome, realizedGain, returnRate }[12], total: {...} }`

**구현 메모**: 뷰 `monthly_investment_summary_v` 1왕복. 기존 `investment_returns` 테이블(수동 입력) CRUD는 **폐지** — 뷰가 대체하며, 수동 입력분은 legacy 스키마 보존 후 판단(계획 문서 확정 사항). 기존 `GET /api/investments/summary`도 본 엔드포인트로 통합.

---

## 12. Recurring

정기거래. 실행분 생성은 pg_cron `process_due_transactions` + 온디맨드 보정(§12.6). 월말 보정 규칙: 1/31 + 1개월 = 2/28, 윤년 처리 (TS `calculateNextDate` 순수 함수와 동일 규칙).

### 12.1 `GET /api/v1/recurring` — 목록 — `200: Recurring[]`

```ts
Recurring = { id, type: 'income'|'expense'|'transfer', amount, description,
  categoryId: uuid|null, accountId: uuid, toAccountId: uuid|null,
  frequency: 'daily'|'weekly'|'monthly'|'yearly', interval: number,
  startDate: date, endDate: date|null, nextDate: date, isActive: boolean }
```

### 12.2 `POST /api/v1/recurring` — 생성

**본문** (Zod `createRecurringTransactionSchema`): `{ type, amount(>0), description(1~200), categoryId?, accountId, toAccountId?, frequency, interval?=1(1~365), startDate, endDate? }` (refine: transfer → toAccountId 필수·상이)

**응답** `201 Recurring`. **구현 메모**: RPC `create_recurring(p_payload jsonb)` 1왕복 — 정의 INSERT + 향후 12개월 pending 거래 생성 원자.

### 12.3 `GET /api/v1/recurring/{id}` — 단건 — `200 Recurring` / `404`

### 12.4 `PATCH /api/v1/recurring/{id}` — 수정

**본문**: 12.2 partial + `isActive?`. **응답** `200 Recurring`.

**구현 메모**: RPC `update_recurring(p_id, p_payload)` 1왕복 — 미래 pending 재생성 포함(applied 이력 불변).

### 12.5 `DELETE /api/v1/recurring/{id}` — 삭제 — `200 { id }` (미래 pending 삭제, applied 이력 보존)

### 12.6 `POST /api/v1/recurring/process` — 온디맨드 실행 보정

**본문**: 없음. **응답** `200`: `{ processed: number, generatedThrough: date }`

**구현 메모**: RPC `process_due_transactions()` 1왕복 — 멱등(이미 처리된 날짜 no-op). pg_cron과 동일 함수. 기존 Vercel cron 라우트(`/api/cron/process-recurring`) 대체.

---

## 13. Forecast

예측. 계산은 **TS 순수 함수**(`src/lib/forecast`) — DB는 입력 데이터 조회와 결과 저장만.

### 13.1 `GET /api/v1/forecast/scenarios` — 시나리오 목록 — `200: Scenario[]`

```ts
Scenario = { id, name, description: string|null,
  assumptions: { incomeGrowthRate?, expenseGrowthRate?, inflationRate?,
                 assetGrowthRates?: Record<uuid, number> } | null,
  startDate: date, endDate: date }
```

### 13.2 `POST /api/v1/forecast/scenarios` — 생성

**본문** (Zod `createForecastScenarioSchema`): `{ name(1~100), description?, assumptions?, startDate, endDate }` → `201 Scenario`

### 13.3 `GET /api/v1/forecast/scenarios/{id}` — 단건 — `200` / `404`

### 13.4 `PATCH /api/v1/forecast/scenarios/{id}` — 수정 (partial) — `200` (수정 시 기존 결과 무효 — `staleResults: true` 플래그 반환)

### 13.5 `DELETE /api/v1/forecast/scenarios/{id}` — 삭제 — `200 { id }` (결과 CASCADE)

### 13.6 `POST /api/v1/forecast/run` — 예측 실행

**본문** (Zod `runForecastSchema`): `{ scenarioId: uuid }`

**응답** `200`: `{ scenarioId, results: ForecastResult[] }`

```ts
ForecastResult = { ym: 'YYYY-MM', projectedIncome, projectedExpense,
  projectedCashflow, projectedNetWorth, goalProgress: number|null }
```

**구현 메모**: 입력(최근 거래 집계 + `asset_values_v`) 1~2왕복 조회 → TS 순수 함수 계산 → 결과 배치 저장 1왕복. 총 2~3왕복.

### 13.7 `GET /api/v1/forecast/results` — 저장된 결과 조회

| 쿼리 | 설명 |
|---|---|
| `scenarioId` | 필수 |

**응답** `200: ForecastResult[]` (없으면 빈 배열 — run 유도). **구현 메모**: 단문 SELECT 1왕복.

---

## 14. Reports

전부 읽기 전용 집계, `Cache-Control` 부여.

### 14.1 `GET /api/v1/reports/trend` — 수입/지출 추이

| 쿼리 | 설명 |
|---|---|
| `from`, `to` | `YYYY-MM`, 기본 최근 12개월 |

**응답** `200`: `{ months: { ym, income, expense, saving, net }[] }`

**구현 메모**: 월별 GROUP BY 집계 SELECT 1왕복.

### 14.2 `GET /api/v1/reports/categories` — 카테고리별 지출 (도넛)

| 쿼리 | 설명 |
|---|---|
| `year`, `month` | 필수 |

**응답** `200`: `{ total, byCategory: { categoryId, name, color, amount, ratio }[] }` (대분류 롤업)

**구현 메모**: `COALESCE(parent_id, id)` 롤업 집계 1왕복.

### 14.3 `GET /api/v1/reports/net-worth` — 순자산 추이

| 쿼리 | 설명 |
|---|---|
| `months` | int, 기본 12 |

**응답** `200`: `{ points: { date, accountTotal, assetTotal, netWorth }[] }`

**구현 메모**: pg_cron 일일 평가 스냅샷 + `account_balances_v` 결합 1왕복.

---

## 15. Export

### 15.1 `GET /api/v1/export/transactions` — 거래 CSV 내보내기

| 쿼리 | 설명 |
|---|---|
| `from`, `to` | date 선택 (없으면 전체) |

**응답** `200`: `text/csv; charset=utf-8` raw body (BOM 포함, Excel 호환) + `Content-Disposition: attachment; filename="transactions_{from}_{to}.csv"`
컬럼: 날짜, 유형, 카테고리, 계좌, 도착계좌, 금액, 내용, 메모, 태그, 할부

**구현 메모**: envelope 미적용 유일한 엔드포인트. 거래 조인 SELECT 1왕복 후 스트리밍 직렬화.

---

## 16. 에러 코드 일람

| code | HTTP | 의미 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Zod 검증 실패 (message = 첫 issue) |
| `UNAUTHORIZED` | 401 | 세션 없음/만료 |
| `FORBIDDEN` | 403 | 세션은 유효하나 소유자(OWNER_EMAIL) 불일치 |
| `NOT_FOUND` | 404 | 자원 없음 (참조 id 포함) |
| `DUPLICATE_BUDGET` | 409 | 동일 year+month 예산 존재 |
| `REFERENCE_EXISTS` | 409 | 참조 중인 자원 삭제 시도 (계좌·카테고리·자산 등) |
| `TRADE_HAS_DEPENDENTS` | 409 | 로트를 소비한 매도가 있는 매수 삭제 시도 |
| `SAVING_CATEGORY_REQUIRED` | 422 | 저축 거래(expense+toAccountId)에 카테고리 누락 |
| `INSUFFICIENT_HOLDINGS` | 422 | 매도 수량 > 보유 잔량 |
| `IMMUTABLE_TRADE_FIELD` | 422 | 매매의 FIFO 영향 필드 수정 시도 |
| `MAX_DEPTH_EXCEEDED` | 422 | 카테고리 3단계 이상 |
| `INTERNAL_ERROR` | 500 | 서버 오류 (상세는 서버 로그에만, 응답에 노출 금지) |

RPC 내부의 `RAISE EXCEPTION`은 커스텀 SQLSTATE 규약으로 위 코드에 매핑한다 — `CF422` → 422 `SAVING_CATEGORY_REQUIRED`, `CF404` → 404 `NOT_FOUND` (메시지 substring 매칭 금지, 매핑은 `src/server/api-errors.ts`에서 단일 관리, 규약 상세는 DB.md §3).

---

## 17. 기존 42개 라우트 → v1 매핑

| 기존 (src/app/api) | v1 | 비고 |
|---|---|---|
| `transactions` GET/POST | §2.1 / §2.2 | POST는 RPC 1왕복화 |
| `transactions/[id]` GET/PATCH/DELETE | §2.3~2.5 | |
| `accounts` GET/POST | §3.1 / §3.2 | 잔액 = 뷰 파생 |
| `accounts/[id]` GET/PATCH/DELETE | §3.3~3.5 | |
| `accounts/reorder` POST | §3.6 `PATCH /accounts/order` | 단일 UPDATE화 |
| `categories` GET/POST | §4.1 / §4.2 | |
| `categories/[id]` PATCH/DELETE | §4.3 / §4.4 | |
| `categories/reorder` POST | §4.5 | |
| `tags` GET | §5.1 | |
| `budget` GET/POST | §6.1 / §6.2 | totalIncome/Expense 입력 제거(파생) |
| `budget/[id]` GET/PATCH/DELETE | §6.3~6.5 | 상세에 실적 포함(1왕복) |
| `budget/copy` POST | §6.6 | |
| `budget/annual-grid` GET/PUT | §6.8 / §6.9 | RPC `get_annual_grid` |
| `budget/summary` GET | §6.10 | |
| `reports/settlement` GET | §7.1 / §7.2 | 월/연 분리, 각 1왕복 |
| `dashboard` GET | §8.1 | `get_dashboard` 1왕복 |
| `dashboard/daily-totals` GET | §8.1에 흡수 | 별도 호출 제거 |
| `assets` GET/POST | §9.1 / §9.2 | currentValue = 뷰 파생 |
| `assets/[id]` GET/PATCH/DELETE | §9.3~9.5 | |
| `assets/portfolio` GET | §9.6 | |
| `assets/[id]/valuations` GET/POST | §9.7 | |
| `asset-categories` GET/POST | §10.1 / §10.2 | |
| `asset-categories/[id]` PATCH/DELETE | §10.3 / §10.4 | |
| `investment-trades` GET/POST | §11.1 / §11.2 | FIFO RPC화 |
| `investment-trades/[id]` PATCH/DELETE | §11.4 / §11.5 | PATCH는 memo 한정 |
| `investment-trades/summary` GET | §11.6 | |
| `investment-trades/tickers` GET | §11.7 | |
| `investment-trades/annual` GET | §11.8 | |
| `investments` GET/POST, `investments/[id]` PATCH/DELETE | **폐지** | `monthly_investment_summary_v` 뷰 대체, 수동 입력분 legacy 보존 |
| `investments/summary` GET | §11.8로 통합 | |
| `recurring` GET/POST | §12.1 / §12.2 | |
| `recurring/[id]` PATCH/DELETE | §12.4 / §12.5 | |
| `cron/process-recurring` | pg_cron + §12.6 | Vercel cron 폐지 |
| `forecast/scenarios` GET/POST | §13.1 / §13.2 | |
| `forecast/scenarios/[id]` PATCH/DELETE | §13.4 / §13.5 | |
| `forecast/run` POST | §13.6 | |
| `forecast/results` GET | §13.7 | |
| `reports/trend` GET | §14.1 | |
| `reports/categories` GET | §14.2 | |
| `reports/net-worth` GET | §14.3 | |
| `export/transactions` GET | §15.1 | |
