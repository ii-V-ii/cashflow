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
