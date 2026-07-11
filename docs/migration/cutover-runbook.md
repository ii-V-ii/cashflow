# Phase 3 — 본 이관(컷오버) 런북 및 현재 상태

> 2026-07-11 기준. 리허설([rehearsal-report.md](./rehearsal-report.md)) 완료 후 사용자 승인
> (①ISA 파생값 1,146,910 채택 — 보정 거래 없음, ②FIFO 재계산 90_ 스크립트 적용) 반영.

## 현재 상태: 원격 실행 대기 (사전 준비·검증 100% 완료)

원격 프로덕션 DB에 대한 psql 실행이 **이 세션의 권한 설정(자동 분류기)에서 거부**되어,
에이전트가 원격 쓰기를 직접 수행하지 못했다(우회하지 않음). 아래는 전부 완료된 상태다:

| 단계 | 상태 |
|---|---|
| 0. 안전 백업 | ✅ `/tmp/cashflow-migration/prod-backup-20260711-142841.dump` (98 KB) — sha256 `cd67329eab3fd3715d738a14ca431d365a54749d3167b854ed94e2d4b1eea99e` (checksum.txt 에 기록) |
| 1. 신선도 확인 | ✅ 최신 백업 vs 리허설 덤프: **전 15개 테이블 row count 동일**, 마지막 쓰기 2026-07-10 02:48 UTC — stale 아님, 새 덤프로 진행 준비됨 |
| 2~8. 컷오버 스크립트 | ✅ 작성 완료 + **프로덕션 백업본을 복원한 로컬 시뮬레이션 DB에서 end-to-end 풀런 성공(exit 0, 4초)** |

## 실행 방법 (1명령)

```bash
# DB_URL: .env.local 의 DATABASE_URL 에서 포트만 6543 → 5432 로 변경(session 모드 필수)
DB_URL='postgresql://postgres.<ref>:<pw>@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres' \
  bash scripts/migration/cutover.sh
```

스크립트가 수행하는 것 (전 단계 로그 출력, 실패 시 즉시 중단):

1. 사전 확인 — `/tmp/cashflow-migration/prod-backup-*.dump` 백업이 없으면 **즉시 중단**
2. 구 public 15개 테이블 + `rls_auto_enable()` → `legacy` 스키마 in-place 이동
   (`10_cutover_move_to_legacy.sql` — 신 스키마 감지 시 no-op 가드, realtime publication 방어적 해제, legacy REVOKE)
3. 신 스키마 마이그레이션 10개 순서 적용 + supabase CLI 부기(supabase_migrations) 기록
4. `transform.sql`(멱등 변환) → `90_fifo_recompute_proposal.sql`(FIFO 재계산, 승인분)
5. 4대 대사 실행 → `/tmp/cashflow-migration/recon-cutover-<ts>.md`
   - **필수 PASS 게이트(자동)**: Row count(1.x) / FIFO 불변식(3.4) / 결산(4.x) — 하나라도 FAIL 이면 중단
6. RLS `app.owner_email` 설정 — auth.users 단일 사용자 자동 감지(복수면 OWNER_EMAIL 환경변수 요구)
7. `process_due_transactions()` + `snapshot_asset_valuations()` 수동 1회(시간 측정 포함)
8. 최종 확인 — legacy/public 테이블 수, row count, cron.job 목록

## 예상 대사 결과 (시뮬레이션 실측 — 동일해야 정상)

**FAIL 6건, 전부 사용자 결정이 반영된 예상 차이** (이 외의 FAIL 은 이상 신호 → 중단·분석):

| 항목 | 내용 | 성격 |
|---|---|---|
| 2.1/2.2 ISA | 저장값 357,810 vs 파생 1,146,910 (+789,100) | 파생값 채택 결정 — 보정 없음(예상) |
| 2.3 주식 | 저장값 3,837,640 vs 파생 3,824,140 (−13,500) | 구 저장값 이중계상 — 파생이 진실(예상) |
| 3.1/3.2 알지노믹스 2건 | buy remaining 2→0, sell realized 0→−57,400 | FIFO 재계산 채택 — 의도적 차이 |

필수 PASS(시뮬레이션 확인): Row count 14/14, FIFO 불변식 21/21 종목, 결산 4개월(2026-04~07) 3-way 전부 일치, to_uuid 충돌 0.

## 사용자 수동 조치 (컷오버 후)

1. **`app.owner_email`**: `postgres` 롤이 커스텀 GUC 영구 설정 권한이 없으면 스크립트가 크게 안내하고 계속 진행한다(로컬은 거부됐고 호스팅은 허용될 수 있음). 미설정 시 RLS fail-closed(API 전부 거부 — 안전하지만 앱 동작 안 함). 거부됐다면 Supabase **SQL Editor** 에서:
   `ALTER DATABASE postgres SET app.owner_email = '<auth.users 의 실제 이메일>';`
2. **Auth 신규 가입 비활성화**: Supabase 대시보드 → Authentication → Sign In / Up → "Allow new users to sign up" OFF (SQL 로 불가 — 대시보드 설정)
3. **pg_cron 확인**: `SELECT * FROM cron.job;` 에 `process-due-transactions`(15:05 UTC), `snapshot-asset-valuations`(15:10 UTC) 2개가 보여야 함. 마이그레이션 중 `pg_cron 사용 불가` WARNING 이 떴다면 대시보드에서 pg_cron 확장 활성화 후 해당 DO 블록 재실행.
4. **Vercel 배포는 하지 않음** — Phase 4 별도.
5. **legacy 스키마**: T+30일(2026-08-11 이후) 삭제 판단. `investment_returns` 는 0건이라 쟁점 없음.

## 롤백 절차 (실패 시)

구 데이터는 legacy 스키마에 **원본 그대로**(이동만 했으므로 무손실) 있다:

```sql
-- 신 public 객체 제거 후 legacy 복귀 (또는 백업 덤프 복원)
DROP TABLE IF EXISTS public.<신 테이블들> CASCADE;  -- 마이그레이션이 만든 객체
ALTER TABLE legacy.<각 테이블> SET SCHEMA public;    -- 15개 테이블 원위치
ALTER FUNCTION legacy.rls_auto_enable() SET SCHEMA public;
```

최후 수단: `pg_restore --clean --no-owner --no-privileges -d "$DB_URL" /tmp/cashflow-migration/prod-backup-20260711-142841.dump`

## 시뮬레이션 검증 기록

- 방식: 프로덕션 백업 덤프를 로컬 `cashflow_prod_sim` DB에 복원(원격과 동일한 public 상태) + auth 스텁 → `cutover.sh` 풀런
- 결과: exit 0, 총 4초. 이동 15테이블 → 마이그레이션 10개 적용(pg_cron 은 sim 제약으로 스킵 WARNING — 원격 postgres DB에서는 정상 등록 예상) → 변환 778 거래 등 전건 → FIFO 보정 2건 → 대사(필수 게이트 전부 통과, 예상 차이 6건만) → 도래분 0건 처리·자산 스냅샷 5건
- 잔여 리스크: pg_cron 등록과 app.owner_email 권한은 호스팅 환경에서만 최종 확인 가능(둘 다 실패해도 컷오버 자체는 안전하게 완료되며 수동 조치로 마무리)
