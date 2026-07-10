# Phase 2B 성능 게이트 — get_dashboard / get_monthly_settlement EXPLAIN 캡처

> docs/DB.md 부록 B 의무 게이트. 거래 3만 건 시드 기준 `EXPLAIN (ANALYZE, BUFFERS)` 실측.
> **기준 <100ms → 3종 전부 통과.**
>
> - 측정일: 2026-07-10
> - 환경: 로컬 Supabase (PostgreSQL 17, supabase start, 포트 54322)
> - 시드: 계좌 12 / 카테고리 20(대분류 10 + 소분류 10) / 거래 30,000건
>   (applied 28,000 · pending 2,000, income 30% · expense 55%(저축성 to_account 일부) ·
>   transfer 15%, 2024-07 ~ 2026-07 분포), 시드 후 `ANALYZE`
> - 재현: 트랜잭션 내 시드 → EXPLAIN → ROLLBACK (phase1-explain.md와 동일 방식)

## 결과 요약

| RPC | Execution Time | Buffers | 기준 | 판정 |
|---|---|---|---|---|
| `get_dashboard(2026, 7)` | **8.771 ms** | shared hit=4344 read=6 | < 100 ms | ✅ 통과 |
| `get_monthly_settlement(2026, 7)` | **9.431 ms** | shared hit=1532 | < 100 ms | ✅ 통과 |
| `get_annual_settlement(2026)` | **3.666 ms** | shared hit=228 | < 100 ms | ✅ 통과 |

관찰:

- `get_dashboard`: `account_balances_v` 합산 + 월 집계 + 캘린더 + 최근 5건 인라인 JSON
  조립을 단일 문에서 처리 — 디스크 read 6블록 외 전부 버퍼 히트.
- `get_monthly_settlement`: `pre_effects`(월 시작 전 전체 이력 스캔)가 지배 비용이나
  3만 건 규모에서 9.4ms — 수용된 위험. **전환 기준(마이그레이션 주석과 동일)**:
  이력 누적으로 실측이 100ms를 넘으면 월별 마감 잔액 스냅샷 테이블
  (예: `account_month_closings`)로 전환해 기초 잔액을 O(계좌 수) 조회로 대체한다.
- `get_annual_settlement`: `idx_tx_date_type_status` 범위 스캔으로 연 단위 롤업 —
  가장 저비용.

## EXPLAIN (ANALYZE, BUFFERS) 원문

```text
=== get_dashboard(2026, 7) ===
 Result  (cost=0.00..0.26 rows=1 width=32) (actual time=8.760..8.760 rows=1 loops=1)
   Buffers: shared hit=4344 read=6
 Planning Time: 0.014 ms
 Execution Time: 8.771 ms

=== get_monthly_settlement(2026, 7) ===
 Result  (cost=0.00..0.26 rows=1 width=32) (actual time=9.419..9.419 rows=1 loops=1)
   Buffers: shared hit=1532
 Planning Time: 0.015 ms
 Execution Time: 9.431 ms

=== get_annual_settlement(2026) ===
 Result  (cost=0.00..0.26 rows=1 width=32) (actual time=3.658..3.658 rows=1 loops=1)
   Buffers: shared hit=228
 Planning Time: 0.010 ms
 Execution Time: 3.666 ms
```

> 함수 호출이 단일 `Result` 노드로 래핑되므로(SQL 함수 내부 계획은 별도 노출되지 않음)
> 상위 노드의 actual time·Buffers가 함수 전체 비용이다. 내부 계획 분해가 필요하면
> `auto_explain.log_nested_statements`로 재실측한다.

## 재현 쿼리

시드·측정 스크립트: 트랜잭션 내에서 아래 순서로 실행 후 ROLLBACK.

1. 계좌 12 / 대분류 10(수입 2·저축 1·소비 7) / 소분류 10 INSERT
2. `generate_series(1, 30000)`으로 거래 INSERT (유형·상태·계좌·카테고리·날짜 모듈로 분포)
3. `ANALYZE transactions, accounts, categories`
4. `EXPLAIN (ANALYZE, BUFFERS) SELECT public.get_dashboard(2026, 7);`
5. `EXPLAIN (ANALYZE, BUFFERS) SELECT public.get_monthly_settlement(2026, 7);`
6. `EXPLAIN (ANALYZE, BUFFERS) SELECT public.get_annual_settlement(2026);`
