# Phase 2 통합 성능 게이트 — 확장 get_dashboard EXPLAIN 재캡처

> docs/DB.md 부록 B 의무 게이트. Phase 2 통합에서 `get_dashboard` 가
> 예산 소진율(budget_totals_v)·투자 요약(monthly_investment_summary_v·asset_values_v)·
> 순자산(자산 미연동 계좌 + 자산 평가액)으로 확장되고,
> `get_monthly_settlement` / `get_annual_settlement` 가 `category_rollup_v` 를
> 사용하도록 교체되어(마이그레이션 `20260716000010`) 3종을 재실측했다.
> **기준 <100ms → 3종 전부 통과.**
>
> - 측정일: 2026-07-10
> - 환경: 로컬 Supabase (PostgreSQL 17, supabase start, 포트 54322)
> - 시드: 계좌 12(자산 연동 2) / 카테고리 20(대분류 10 + 소분류 10) /
>   거래 30,000건(applied 28,000 · pending 2,000, income 30% · expense 55% ·
>   transfer 15%, 2024-07 ~ 2026-07 분포) /
>   예산 25개월 × 항목 8 / 자산 5 · 평가이력 60 · 매매 2,000건, 시드 후 `ANALYZE`
> - 재현: 트랜잭션 내 시드 → EXPLAIN → ROLLBACK (phase2b-explain.md와 동일 방식)

## 결과 요약

| RPC | Execution Time | Buffers | 기준 | 판정 |
|---|---|---|---|---|
| `get_dashboard(2026, 7)` (확장) | **23.750 ms** | shared hit=12842 | < 100 ms | ✅ 통과 |
| `get_monthly_settlement(2026, 7)` (rollup 뷰) | **8.534 ms** | shared hit=1469 | < 100 ms | ✅ 통과 |
| `get_annual_settlement(2026)` (rollup 뷰) | **3.239 ms** | shared hit=206 | < 100 ms | ✅ 통과 |

관찰:

- `get_dashboard`: 2B 시점 8.8ms → 23.8ms. 증가분은 `asset_values_v`
  (연동 계좌 잔액 합산 = `account_balances_v` 전체 이력 스캔 경유) +
  `monthly_investment_summary_v`(매매 2,000건 집계) + 순자산용 미연동 잔액 재합산 (실행마다 ±2ms 변동).
  전부 버퍼 히트이며 1왕복 계약 유지 — 기준 대비 여유 충분.
- `get_monthly_settlement` / `get_annual_settlement`: `category_rollup_v` 교체는
  뷰 인라이닝으로 기존 계획과 동일 — 실측도 2B 캡처와 동급(7.2ms / 3.1ms).
- 전환 기준(2B 캡처와 동일): 이력 누적으로 실측이 100ms를 넘으면 월별 마감 잔액
  스냅샷 테이블로 기초 잔액·계좌 합산을 O(계좌 수) 조회로 대체한다.

## EXPLAIN (ANALYZE, BUFFERS) 원문

```text
=== get_dashboard(2026, 7) ===
 Result  (cost=0.00..0.26 rows=1 width=32) (actual time=23.739..23.740 rows=1 loops=1)
   Buffers: shared hit=12842
 Planning Time: 0.013 ms
 Execution Time: 23.750 ms

=== get_monthly_settlement(2026, 7) ===
 Result  (cost=0.00..0.26 rows=1 width=32) (actual time=8.525..8.525 rows=1 loops=1)
   Buffers: shared hit=1469
 Planning Time: 0.013 ms
 Execution Time: 8.534 ms

=== get_annual_settlement(2026) ===
 Result  (cost=0.00..0.26 rows=1 width=32) (actual time=3.230..3.230 rows=1 loops=1)
   Buffers: shared hit=206
 Planning Time: 0.013 ms
 Execution Time: 3.239 ms
```

> 함수 호출이 단일 `Result` 노드로 래핑되므로(SQL 함수 내부 계획은 별도 노출되지 않음)
> 상위 노드의 actual time·Buffers가 함수 전체 비용이다.

## 재현 쿼리

시드·측정 스크립트: 트랜잭션 내에서 아래 순서로 실행 후 ROLLBACK.

1. 계좌 12 / 대분류 10(수입 2·저축 1·소비 7) / 소분류 10 INSERT
2. `generate_series(1, 30000)`으로 거래 INSERT (유형·상태·계좌·카테고리·날짜 모듈로 분포)
3. 예산 25개월(`budgets` + `budget_items` 8개/월), 자산 5(계좌 연동 2)·평가이력 60·
   `investment_trades` 2,000건 INSERT
4. `ANALYZE` 대상 테이블 전체
5. `EXPLAIN (ANALYZE, BUFFERS) SELECT public.get_dashboard(2026, 7);`
6. `EXPLAIN (ANALYZE, BUFFERS) SELECT public.get_monthly_settlement(2026, 7);`
7. `EXPLAIN (ANALYZE, BUFFERS) SELECT public.get_annual_settlement(2026);`
