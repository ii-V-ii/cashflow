# Phase 1 성능 게이트 — account_balances_v EXPLAIN 캡처

> docs/DB.md 부록 B 의무 게이트. 거래 3만 건 시드 기준 `account_balances_v` 전체 조회
> `EXPLAIN (ANALYZE, BUFFERS)` 실측. **기준 <100ms → 통과 (11.5ms)**.
>
> - 측정일: 2026-07-10
> - 환경: 로컬 Supabase (PostgreSQL 17, supabase start, 포트 54322)
> - 시드: 계좌 12 / 카테고리 20 / 거래 30,000건 (applied 28,000 · pending 2,000,
>   income 30% · expense 55%(저축성 to_account 포함) · transfer 15%), 시드 후 `ANALYZE`
> - 재현: 트랜잭션 내 시드 → EXPLAIN → ROLLBACK (아래 쿼리 참조)
> - `get_dashboard` / `budget_totals_v` 게이트는 해당 RPC·뷰가 생성되는 트랙(Phase 1b/예산 트랙)에서 캡처한다.

## 결과 요약

| 항목 | 값 | 기준 | 판정 |
|---|---|---|---|
| Execution Time | **11.543 ms** | < 100 ms | ✅ 통과 |
| Planning Time | 0.417 ms | — | — |
| Buffers | shared hit=1173 (디스크 read 0) | — | — |

관찰:
- 입금 측(UNION ALL 두 번째 분기)은 `idx_tx_to_account` 부분 인덱스의 Bitmap Index Scan 사용.
- 출금/수입 측은 30k 전행 Seq Scan + Parallel Append — 계좌 수(12)가 적어 GroupAggregate가 지배적이지 않고, 3만 건 규모에서는 Seq Scan이 최적. 수십만 건 도달 시 `idx_tx_account_status` (INCLUDE type, amount) 커버링 인덱스 경로 재검토.

## EXPLAIN (ANALYZE, BUFFERS) 원문

```text
 Hash Right Join  (cost=2217.26..2272.49 rows=12 width=47) (actual time=11.429..11.482 rows=12 loops=1)
   Hash Cond: (transactions.account_id = a.id)
   Buffers: shared hit=1173
   ->  Finalize GroupAggregate  (cost=2215.99..2268.66 rows=200 width=24) (actual time=11.412..11.460 rows=12 loops=1)
         Group Key: transactions.account_id
         Buffers: shared hit=1172
         ->  Gather Merge  (cost=2215.99..2262.66 rows=400 width=48) (actual time=11.399..11.444 rows=12 loops=1)
               Workers Planned: 2
               Workers Launched: 2
               Buffers: shared hit=1172
               ->  Sort  (cost=1215.96..1216.46 rows=200 width=48) (actual time=3.852..3.852 rows=4 loops=3)
                     Sort Key: transactions.account_id
                     Sort Method: quicksort  Memory: 25kB
                     Buffers: shared hit=1172
                     Worker 0:  Sort Method: quicksort  Memory: 25kB
                     Worker 1:  Sort Method: quicksort  Memory: 25kB
                     ->  Partial HashAggregate  (cost=1205.82..1208.32 rows=200 width=48) (actual time=3.677..3.678 rows=4 loops=3)
                           Group Key: transactions.account_id
                           Batches: 1  Memory Usage: 40kB
                           Buffers: shared hit=1158
                           Worker 0:  Batches: 1  Memory Usage: 40kB
                           Worker 1:  Batches: 1  Memory Usage: 40kB
                           ->  Parallel Append  (cost=0.00..1138.91 rows=13382 width=24) (actual time=0.127..2.611 rows=11133 loops=3)
                                 Buffers: shared hit=1158
                                 ->  Seq Scan on transactions  (cost=0.00..1072.00 rows=28000 width=24) (actual time=0.008..4.221 rows=28000 loops=1)
                                       Filter: (status = 'applied'::text)
                                       Rows Removed by Filter: 2000
                                       Buffers: shared hit=557
                                 ->  Bitmap Heap Scan on transactions transactions_1  (cost=228.56..873.76 rows=4116 width=24) (actual time=0.378..1.935 rows=5400 loops=1)
                                       Recheck Cond: ((status = 'applied'::text) AND (to_account_id IS NOT NULL))
                                       Filter: (type = ANY ('{transfer,expense}'::text[]))
                                       Heap Blocks: exact=557
                                       Buffers: shared hit=601
                                       ->  Bitmap Index Scan on idx_tx_to_account  (cost=0.00..227.53 rows=5880 width=0) (actual time=0.334..0.334 rows=5400 loops=1)
                                             Index Cond: (status = 'applied'::text)
                                             Buffers: shared hit=44
   ->  Hash  (cost=1.12..1.12 rows=12 width=39) (actual time=0.013..0.014 rows=12 loops=1)
         Buckets: 1024  Batches: 1  Memory Usage: 9kB
         Buffers: shared hit=1
         ->  Seq Scan on accounts a  (cost=0.00..1.12 rows=12 width=39) (actual time=0.005..0.006 rows=12 loops=1)
               Buffers: shared hit=1
 Planning:
   Buffers: shared hit=189
 Planning Time: 0.417 ms
 Execution Time: 11.543 ms
```

## 재현 쿼리

```sql
begin;

insert into public.accounts (id, name, type, initial_balance)
select
  ('00000000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid,
  '계좌 ' || g,
  (array['bank','card','savings','cash'])[1 + g % 4],
  (g * 100000)::bigint
from generate_series(1, 12) g;

insert into public.categories (id, name, type, expense_kind)
select
  ('00000000-0000-0000-0000-00000000c0' || lpad(g::text, 2, '0'))::uuid,
  '카테고리 ' || g,
  case when g <= 4 then 'income' else 'expense' end,
  case when g <= 4 then null
       when g % 5 = 0 then 'saving'
       else 'consumption' end
from generate_series(1, 20) g;

insert into public.transactions
  (type, amount, description, status, category_id, account_id, to_account_id, date)
select
  t.type,
  (100 + (g * 37) % 500000)::bigint,
  '시드 거래 ' || g,
  case when g % 15 = 0 then 'pending' else 'applied' end,
  case when t.type = 'transfer' then null
       when t.type = 'income'
         then ('00000000-0000-0000-0000-00000000c0' || lpad((1 + g % 4)::text, 2, '0'))::uuid
       else ('00000000-0000-0000-0000-00000000c0' || lpad((5 + g % 16)::text, 2, '0'))::uuid
  end,
  ('00000000-0000-0000-0000-0000000000' || lpad((1 + g % 12)::text, 2, '0'))::uuid,
  case
    when t.type = 'transfer' or (t.type = 'expense' and g % 10 = 0)
      then ('00000000-0000-0000-0000-0000000000' || lpad((1 + (g + 5) % 12)::text, 2, '0'))::uuid
    else null
  end,
  date '2024-01-01' + (g % 900)
from generate_series(1, 30000) g
cross join lateral (
  select case
    when g % 100 < 30 then 'income'
    when g % 100 < 85 then 'expense'
    else 'transfer'
  end as type
) t;

analyze public.transactions;
analyze public.accounts;

explain (analyze, buffers)
select * from public.account_balances_v;

rollback;
```

---

# Phase 1 수정 라운드 — listTransactions 대표 필터 조합 EXPLAIN (DB-H2/H3)

> 거래 3만 건 + 태그 10종(거래의 약 20% 연결) 시드 기준, `GET /api/v1/transactions`가 실행하는
> 조인·정렬·윈도우 count 구조 그대로 5개 대표 필터 조합을 `EXPLAIN (ANALYZE, BUFFERS)` 실측.
> **기준 <100ms — 전 조합 통과.**
>
> - 측정일: 2026-07-10 (Phase 1 수정 라운드)
> - 환경: 로컬 Supabase (PostgreSQL 17, supabase start, 포트 54322)
> - 시드: 위 "재현 쿼리"와 동일 + memo(1/7)·태그 10종/`transaction_tags` 약 6,000행, 시드 후 `ANALYZE`
> - 방법: 트랜잭션 내 시드 → 각 조합 EXPLAIN → ROLLBACK

## 결과 요약

| # | 조합 | Execution Time | 기준 | 판정 | 주요 플랜 |
|---|---|---|---|---|---|
| 1 | 기본 월 조회 (`from`/`to`, page 1) | **2.53 ms** | <100ms | ✅ | `idx_tx_date_type_status` Bitmap Index Scan (1,020행) |
| 2 | `search` (description/memo ILIKE) | **21.45 ms** | <100ms | ✅ | transactions Seq Scan (30k 전행 필터) — 아래 관찰 참조 |
| 3 | `tags` 필터 (EXISTS) | **3.75 ms** | <100ms | ✅ | `idx_transaction_tags_tag_id` 경유 세미조인 |
| 4 | `accountId` OR `to_account_id` | **6.55 ms** | <100ms | ✅ | `idx_tx_account_status` + `idx_tx_to_account` BitmapOr |
| 5 | 페이지 후반 OFFSET (page 1000, 무필터) | **64.90 ms** | <100ms | ✅ | `idx_tx_date_type_status` Backward Scan 30k행 + lateral 태그 30k회 |

## 관찰

- **[2] search**: `%…%` ILIKE는 인덱스 불가 → 30k 전행 Seq Scan(약 21ms). 3만 건 규모에서는 기준 내.
  검색 지연이 체감되는 시점(수십만 건 또는 >100ms)에 `pg_trgm` GIN 인덱스
  (`description gin_trgm_ops`, `memo gin_trgm_ops`)를 도입한다 — docs/DB.md §4 기준 참조.
- **[5] 페이지 후반 OFFSET**: OFFSET 19,980은 선행 2만 행을 읽고 버리며, lateral 태그 집계가
  행마다 실행돼(30k loops) 비용의 대부분을 차지한다(64.9ms). 무한 스크롤 UI 특성상 실사용 도달
  가능성이 낮고 기준 내이므로 유지 — 수십만 건 도달 시 keyset pagination(date, created_at 커서) 전환 후보.
- [1]·[4]는 기존 인덱스(`idx_tx_date_type_status`, `idx_tx_account_status`/`idx_tx_to_account`)가
  그대로 사용됨을 확인. [3]은 `idx_transaction_tags_tag_id` 역방향 인덱스 경유.

## 재현 (요약)

시드는 위 "재현 쿼리"에 아래 태그 시드를 추가한 뒤, listTransactions와 동일한
`JOIN accounts / LEFT JOIN categories / LEFT JOIN accounts(ta) / LEFT JOIN LATERAL(태그 jsonb_agg)` +
`count(*) over()` + `ORDER BY date DESC, created_at DESC LIMIT 20` 골격에 각 필터를 적용해 EXPLAIN 한다.

```sql
insert into public.tags (id, name)
select ('00000000-0000-0000-0000-00000000e0' || lpad(g::text, 2, '0'))::uuid, '태그' || g
from generate_series(1, 10) g;

insert into public.transaction_tags (transaction_id, tag_id)
select t.id,
  ('00000000-0000-0000-0000-00000000e0' || lpad((1 + (row_number() over ()) % 10)::text, 2, '0'))::uuid
from public.transactions t
where (t.amount % 5) = 0;

-- 필터 조합:
-- [1] t.date >= '2024-06-01' and t.date <= '2024-06-30'
-- [2] (t.description ilike '%거래 123%' or t.memo ilike '%거래 123%')
-- [3] exists (select 1 from transaction_tags xt join tags xtag on xtag.id = xt.tag_id
--             where xt.transaction_id = t.id and xtag.name = any(array['태그3']))
-- [4] (t.account_id = :id or t.to_account_id = :id)
-- [5] 무필터 + limit 20 offset 19980
```
