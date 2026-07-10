# Phase 2A 성능 게이트 — budget_totals_v EXPLAIN 캡처

> docs/DB.md 부록 B 의무 게이트. `budget_totals_v`의 `NOT EXISTS` 상관 서브쿼리
> 실행계획 검증(카테고리 수 대비 비용). **기준 <100ms → 전부 통과**.
>
> - 측정일: 2026-07-10
> - 환경: 로컬 Supabase (PostgreSQL 17, supabase start, 포트 54322)
> - 시드: 카테고리 48(대분류 12 × 소분류 3), 계좌 5, 월별 예산 24개(2025~2026 전월),
>   예산 항목 1,152건(부모+자식 전부 편성 — NOT EXISTS 최악 케이스), 거래 30,000건
>   (applied ~28,000 · pending ~2,000), 시드 후 `ANALYZE`
> - 재현: 트랜잭션 내 시드 → EXPLAIN → ROLLBACK

## 결과 요약

| 항목 | Execution Time | 기준 | 판정 |
|---|---|---|---|
| `budget_totals_v` 전체 조회 (24 예산 × 1,152 항목) | **0.667 ms** | < 100 ms | ✅ 통과 |
| `get_budget_actuals(2026, 3)` (거래 30,000건) | **2.368 ms** | < 100 ms | ✅ 통과 |
| `get_annual_grid(2026)` | **3.575 ms** | < 100 ms | ✅ 통과 |

관찰:
- `NOT EXISTS` 상관 서브쿼리는 플래너가 **hashed SubPlan**으로 변환 — 예산 항목 전체를
  1회 해시 빌드(1,152행) 후 조인 필터로 사용하므로 항목 수에 선형. O(n²) 상관 실행 없음.
- `get_budget_actuals`는 월 범위 조건이 `idx_tx_date_type_status` 선두 컬럼(date)과 일치,
  buffers shared hit 491로 3만 건 규모에서 여유.
- 카테고리·예산 테이블은 수십 행 규모라 Seq Scan이 최적(인덱스 강제 불필요).

## EXPLAIN (ANALYZE, BUFFERS) 원문

```text
=== budget_totals_v 전체 조회 (예산 24 × 항목 1,152) ===
                                                                 QUERY PLAN                                                                 
--------------------------------------------------------------------------------------------------------------------------------------------
 HashAggregate  (cost=261.28..261.76 rows=24 width=40) (actual time=0.614..0.618 rows=24 loops=1)
   Group Key: b.id
   Batches: 1  Memory Usage: 24kB
   Buffers: shared hit=33
   ->  Hash Left Join  (cost=3.62..254.08 rows=576 width=39) (actual time=0.269..0.531 rows=864 loops=1)
         Hash Cond: (bi.category_id = c.id)
         Buffers: shared hit=33
         ->  Hash Right Join  (cost=1.54..250.35 rows=576 width=48) (actual time=0.261..0.455 rows=864 loops=1)
               Hash Cond: (bi.budget_id = b.id)
               Join Filter: (NOT (ANY ((b.id = (hashed SubPlan 2).col1) AND (bi.category_id = (hashed SubPlan 2).col2))))
               Rows Removed by Join Filter: 288
               Buffers: shared hit=32
               ->  Seq Scan on budget_items bi  (cost=0.00..26.52 rows=1152 width=40) (actual time=0.002..0.041 rows=1152 loops=1)
                     Buffers: shared hit=15
               ->  Hash  (cost=1.24..1.24 rows=24 width=24) (actual time=0.007..0.008 rows=24 loops=1)
                     Buckets: 1024  Batches: 1  Memory Usage: 10kB
                     Buffers: shared hit=1
                     ->  Seq Scan on budgets b  (cost=0.00..1.24 rows=24 width=24) (actual time=0.004..0.005 rows=24 loops=1)
                           Buffers: shared hit=1
               SubPlan 2
                 ->  Hash Join  (cost=2.08..31.89 rows=1152 width=32) (actual time=0.009..0.171 rows=1152 loops=1)
                       Hash Cond: (bic.category_id = cc.id)
                       Buffers: shared hit=16
                       ->  Seq Scan on budget_items bic  (cost=0.00..26.52 rows=1152 width=32) (actual time=0.001..0.050 rows=1152 loops=1)
                             Buffers: shared hit=15
                       ->  Hash  (cost=1.48..1.48 rows=48 width=32) (actual time=0.007..0.007 rows=48 loops=1)
                             Buckets: 1024  Batches: 1  Memory Usage: 11kB
                             Buffers: shared hit=1
                             ->  Seq Scan on categories cc  (cost=0.00..1.48 rows=48 width=32) (actual time=0.001..0.004 rows=48 loops=1)
                                   Buffers: shared hit=1
         ->  Hash  (cost=1.48..1.48 rows=48 width=23) (actual time=0.006..0.006 rows=48 loops=1)
               Buckets: 1024  Batches: 1  Memory Usage: 11kB
               Buffers: shared hit=1
               ->  Seq Scan on categories c  (cost=0.00..1.48 rows=48 width=23) (actual time=0.001..0.003 rows=48 loops=1)
                     Buffers: shared hit=1
 Planning:
   Buffers: shared hit=155 read=1
 Planning Time: 0.409 ms
 Execution Time: 0.667 ms
(39 rows)

=== get_budget_actuals(2026, 3) — 거래 30,000건 ===
                                     QUERY PLAN                                      
-------------------------------------------------------------------------------------
 Result  (cost=0.00..0.26 rows=1 width=32) (actual time=2.363..2.364 rows=1 loops=1)
   Buffers: shared hit=489 read=2
 Planning Time: 0.005 ms
 Execution Time: 2.368 ms
(4 rows)

=== get_annual_grid(2026) ===
                                     QUERY PLAN                                      
-------------------------------------------------------------------------------------
 Result  (cost=0.00..0.26 rows=1 width=32) (actual time=3.572..3.572 rows=1 loops=1)
   Buffers: shared hit=3124
 Planning Time: 0.003 ms
 Execution Time: 3.575 ms
(4 rows)
```
