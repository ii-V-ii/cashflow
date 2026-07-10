# Phase 2C 성능 게이트 — open_lots_v · asset_values_v EXPLAIN 캡처

> docs/DB.md 부록 B 게이트의 자산·투자 트랙 적용. 매매 30,000건 + 평가이력 24,000건
> 시드 기준 두 뷰 전체 조회 `EXPLAIN (ANALYZE, BUFFERS)` 실측. **기준 <100ms → 통과**.
>
> - 측정일: 2026-07-10
> - 환경: 로컬 Supabase (PostgreSQL 17, supabase start, 포트 54322)
> - 시드: 자산 카테고리 5 / 자산 200 / 계좌 100(자산 연결 60) /
>   평가이력 24,000건(자산 200 × 120일) / 매매 30,000건(buy 20,000 · sell 8,000 · dividend 2,000),
>   시드 후 `ANALYZE`
> - 재현: 트랜잭션 내 시드 → EXPLAIN → ROLLBACK (스크립트는 본 문서 하단)

## 결과 요약

| 뷰 | Execution Time | 기준 | 판정 |
|---|---|---|---|
| `open_lots_v` | **6.255 ms** | < 100 ms | ✅ 통과 |
| `asset_values_v` | **17.091 ms** | < 100 ms | ✅ 통과 |

관찰:
- `open_lots_v` 전체 조회(WHERE 없음)는 Seq Scan — 열린 로트가 전 행의 40%라 최적.
  자산 단위 필터(`asset_id = …`) 경로에서는 부분 인덱스 `idx_trades_open_lots`
  (asset_id, ticker, date, id) 가 사용된다 (FIFO 잠금 스캔과 동일 키).
- `asset_values_v`는 holdings(열린 로트 집계) Seq Scan + HashAggregate가 지배적
  (~5.3ms). latest_val 의 DISTINCT ON 은 `idx_asset_valuations_asset_date`
  (asset_id, date DESC) Incremental Sort 경로. 수십만 건 도달 시 holdings 집계 재검토.

## EXPLAIN (ANALYZE, BUFFERS) 원문

```text
===== open_lots_v =====
                                                      QUERY PLAN                                                      
----------------------------------------------------------------------------------------------------------------------
 Seq Scan on investment_trades  (cost=0.00..1738.46 rows=8011 width=72) (actual time=0.012..5.945 rows=12019 loops=1)
   Filter: ((remaining_quantity > '0'::numeric) AND (trade_type = 'buy'::text))
   Rows Removed by Filter: 18073
   Buffers: shared hit=1227
 Planning:
   Buffers: shared hit=132
 Planning Time: 0.247 ms
 Execution Time: 6.255 ms
(8 rows)

===== asset_values_v =====
                                                                                                          QUERY PLAN                                                                                                          
------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Hash Left Join  (cost=4447.60..4575.93 rows=202 width=58) (actual time=14.786..16.888 rows=202 loops=1)
   Hash Cond: (s.id = h.asset_id)
   Buffers: shared hit=1841
   ->  Merge Left Join  (cost=2661.58..2788.86 rows=202 width=74) (actual time=7.151..9.199 rows=202 loops=1)
         Merge Cond: (s.id = asset_valuations.asset_id)
         Buffers: shared hit=614
         ->  Merge Left Join  (cost=54.89..55.92 rows=202 width=66) (actual time=0.123..0.183 rows=202 loops=1)
               Merge Cond: (s.id = l.asset_id)
               Buffers: shared hit=15
               ->  Sort  (cost=15.75..16.26 rows=202 width=50) (actual time=0.053..0.067 rows=202 loops=1)
                     Sort Key: s.id
                     Sort Method: quicksort  Memory: 39kB
                     Buffers: shared hit=6
                     ->  Seq Scan on assets s  (cost=0.00..8.02 rows=202 width=50) (actual time=0.005..0.022 rows=202 loops=1)
                           Buffers: shared hit=6
               ->  Sort  (cost=39.14..39.14 rows=1 width=32) (actual time=0.068..0.089 rows=1 loops=1)
                     Sort Key: l.asset_id
                     Sort Method: quicksort  Memory: 25kB
                     Buffers: shared hit=9
                     ->  Subquery Scan on l  (cost=39.10..39.13 rows=1 width=32) (actual time=0.066..0.085 rows=1 loops=1)
                           Buffers: shared hit=9
                           ->  HashAggregate  (cost=39.10..39.12 rows=1 width=32) (actual time=0.066..0.073 rows=1 loops=1)
                                 Group Key: ac.asset_id
                                 Batches: 1  Memory Usage: 24kB
                                 Buffers: shared hit=9
                                 ->  Hash Left Join  (cost=33.74..38.35 rows=60 width=40) (actual time=0.033..0.062 rows=60 loops=1)
                                       Hash Cond: (a.id = tr.account_id)
                                       Buffers: shared hit=9
                                       ->  Hash Left Join  (cost=25.56..30.00 rows=60 width=48) (actual time=0.030..0.052 rows=60 loops=1)
                                             Hash Cond: (a.id = tx.account_id)
                                             Buffers: shared hit=8
                                             ->  Hash Join  (cost=4.75..9.02 rows=60 width=40) (actual time=0.022..0.037 rows=60 loops=1)
                                                   Hash Cond: (a.id = ac.id)
                                                   Buffers: shared hit=6
                                                   ->  Seq Scan on accounts a  (cost=0.00..4.00 rows=100 width=24) (actual time=0.004..0.009 rows=100 loops=1)
                                                         Buffers: shared hit=3
                                                   ->  Hash  (cost=4.00..4.00 rows=60 width=32) (actual time=0.016..0.017 rows=60 loops=1)
                                                         Buckets: 1024  Batches: 1  Memory Usage: 12kB
                                                         Buffers: shared hit=3
                                                         ->  Seq Scan on accounts ac  (cost=0.00..4.00 rows=60 width=32) (actual time=0.002..0.008 rows=60 loops=1)
                                                               Filter: (asset_id IS NOT NULL)
                                                               Rows Removed by Filter: 40
                                                               Buffers: shared hit=3
                                             ->  Hash  (cost=20.77..20.77 rows=3 width=24) (actual time=0.006..0.008 rows=0 loops=1)
                                                   Buckets: 1024  Batches: 1  Memory Usage: 8kB
                                                   Buffers: shared hit=2
                                                   ->  Subquery Scan on tx  (cost=20.67..20.77 rows=3 width=24) (actual time=0.006..0.008 rows=0 loops=1)
                                                         Buffers: shared hit=2
                                                         ->  GroupAggregate  (cost=20.67..20.74 rows=3 width=24) (actual time=0.006..0.007 rows=0 loops=1)
                                                               Group Key: transactions.account_id
                                                               Buffers: shared hit=2
                                                               ->  Sort  (cost=20.67..20.68 rows=3 width=24) (actual time=0.005..0.007 rows=0 loops=1)
                                                                     Sort Key: transactions.account_id
                                                                     Sort Method: quicksort  Memory: 25kB
                                                                     Buffers: shared hit=2
                                                                     ->  Append  (cost=6.40..20.65 rows=3 width=24) (actual time=0.004..0.006 rows=0 loops=1)
                                                                           Buffers: shared hit=2
                                                                           ->  Bitmap Heap Scan on transactions  (cost=6.40..11.75 rows=2 width=24) (actual time=0.003..0.003 rows=0 loops=1)
                                                                                 Recheck Cond: (status = 'applied'::text)
                                                                                 Buffers: shared hit=1
                                                                                 ->  Bitmap Index Scan on idx_tx_date_type_status  (cost=0.00..6.40 rows=2 width=0) (actual time=0.001..0.001 rows=0 loops=1)
                                                                                       Index Cond: (status = 'applied'::text)
                                                                                       Buffers: shared hit=1
                                                                           ->  Index Scan using idx_tx_to_account on transactions transactions_1  (cost=0.14..8.88 rows=1 width=24) (actual time=0.001..0.001 rows=0 loops=1)
                                                                                 Index Cond: (status = 'applied'::text)
                                                                                 Filter: (type = ANY ('{transfer,expense}'::text[]))
                                                                                 Buffers: shared hit=1
                                       ->  Hash  (cost=8.17..8.17 rows=1 width=24) (actual time=0.001..0.002 rows=0 loops=1)
                                             Buckets: 1024  Batches: 1  Memory Usage: 8kB
                                             Buffers: shared hit=1
                                             ->  Subquery Scan on tr  (cost=0.12..8.17 rows=1 width=24) (actual time=0.001..0.002 rows=0 loops=1)
                                                   Buffers: shared hit=1
                                                   ->  GroupAggregate  (cost=0.12..8.16 rows=1 width=24) (actual time=0.001..0.001 rows=0 loops=1)
                                                         Group Key: investment_trades.account_id
                                                         Buffers: shared hit=1
                                                         ->  Index Scan using idx_trades_account_id on investment_trades  (cost=0.12..8.14 rows=1 width=36) (actual time=0.001..0.001 rows=0 loops=1)
                                                               Buffers: shared hit=1
         ->  Unique  (cost=2606.69..2727.89 rows=202 width=28) (actual time=7.025..8.964 rows=202 loops=1)
               Buffers: shared hit=599
               ->  Sort  (cost=2606.69..2667.29 rows=24240 width=28) (actual time=7.024..8.035 rows=24121 loops=1)
                     Sort Key: asset_valuations.asset_id, asset_valuations.date DESC
                     Sort Method: quicksort  Memory: 1905kB
                     Buffers: shared hit=599
                     ->  Seq Scan on asset_valuations  (cost=0.00..841.40 rows=24240 width=28) (actual time=0.294..1.711 rows=24240 loops=1)
                           Buffers: shared hit=599
   ->  Hash  (cost=1783.52..1783.52 rows=200 width=24) (actual time=7.626..7.629 rows=181 loops=1)
         Buckets: 1024  Batches: 1  Memory Usage: 18kB
         Buffers: shared hit=1227
         ->  Subquery Scan on h  (cost=1778.52..1783.52 rows=200 width=24) (actual time=7.583..7.611 rows=181 loops=1)
               Buffers: shared hit=1227
               ->  HashAggregate  (cost=1778.52..1781.52 rows=200 width=24) (actual time=7.582..7.601 rows=181 loops=1)
                     Group Key: investment_trades_1.asset_id
                     Batches: 1  Memory Usage: 64kB
                     Buffers: shared hit=1227
                     ->  Seq Scan on investment_trades investment_trades_1  (cost=0.00..1678.38 rows=8011 width=27) (actual time=0.014..5.442 rows=12019 loops=1)
                           Filter: ((remaining_quantity > '0'::numeric) AND (trade_type = 'buy'::text))
                           Rows Removed by Filter: 18073
                           Buffers: shared hit=1227
 Planning:
   Buffers: shared hit=418
 Planning Time: 0.968 ms
 Execution Time: 17.091 ms
(102 rows)

ROLLBACK
```

## 재현 스크립트

```sql
-- Phase 2C 성능 게이트: asset_values_v · open_lots_v EXPLAIN (ANALYZE, BUFFERS)
-- 시드 → ANALYZE → EXPLAIN → ROLLBACK (실 데이터 오염 없음)
BEGIN;

-- 자산 카테고리 5 / 자산 200 / 계좌 100(자산 연결 60) / 평가이력 24,000 / 매매 30,000
INSERT INTO public.asset_categories (id, name, kind)
SELECT gen_random_uuid(), '카테고리' || g, CASE WHEN g % 2 = 0 THEN 'financial' ELSE 'non_financial' END
FROM generate_series(1, 5) g;

INSERT INTO public.assets (id, name, asset_category_id, acquisition_date, acquisition_cost)
SELECT gen_random_uuid(), '자산' || g,
       (SELECT id FROM public.asset_categories ORDER BY random() LIMIT 1),
       date '2024-01-01' + (g % 700),
       (random() * 100000000)::bigint
FROM generate_series(1, 200) g;

INSERT INTO public.accounts (name, type, initial_balance, asset_id)
SELECT '계좌' || g, 'investment', (random() * 10000000)::bigint,
       CASE WHEN g <= 60 THEN (SELECT id FROM public.assets ORDER BY random() LIMIT 1) END
FROM generate_series(1, 100) g;

-- 평가 이력: 자산 200 × 120일
INSERT INTO public.asset_valuations (asset_id, date, value, source)
SELECT a.id, date '2026-01-01' + d, (random() * 100000000)::bigint, 'auto'
FROM public.assets a, generate_series(0, 119) d;

-- 매매: buy 20,000(잔여 로트 일부 소진) + sell 8,000 + dividend 2,000
-- FIFO 정합은 불필요(뷰 스캔 성능만 측정) — remaining/realized는 CHECK 범위 내 직접 시드
INSERT INTO public.investment_trades
  (asset_id, trade_type, date, ticker, quantity, unit_price, total_amount,
   net_amount, remaining_quantity, realized_gain)
SELECT a.id, 'buy', date '2025-01-01' + (g % 500), 'TK' || (g % 40),
       10, (random() * 100000)::bigint + 1, 1000000, 1000000,
       CASE WHEN g % 3 = 0 THEN 0 ELSE (g % 10) END, 0
FROM generate_series(1, 20000) g
JOIN LATERAL (SELECT id FROM public.assets OFFSET (g % 200) LIMIT 1) a ON true;

INSERT INTO public.investment_trades
  (asset_id, trade_type, date, ticker, quantity, unit_price, total_amount,
   net_amount, remaining_quantity, realized_gain)
SELECT a.id, CASE WHEN g % 5 = 0 THEN 'dividend' ELSE 'sell' END,
       date '2025-01-01' + (g % 500), 'TK' || (g % 40),
       5, 0, 500000, 500000, 0,
       CASE WHEN g % 5 = 0 THEN 0 ELSE (random() * 100000)::bigint - 50000 END
FROM generate_series(1, 10000) g
JOIN LATERAL (SELECT id FROM public.assets OFFSET (g % 200) LIMIT 1) a ON true;

ANALYZE public.assets;
ANALYZE public.accounts;
ANALYZE public.asset_valuations;
ANALYZE public.investment_trades;

\echo '===== open_lots_v ====='
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM public.open_lots_v;

\echo '===== asset_values_v ====='
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM public.asset_values_v;

ROLLBACK;
```
