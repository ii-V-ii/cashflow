#!/usr/bin/env bash
# cutover.sh — 본 이관 마스터 스크립트 (MIGRATION.md §7 + 리허설 검증 절차)
#
# 사용법:
#   DB_URL='postgresql://postgres.<ref>:<pw>@<host>:5432/postgres' \
#     [OWNER_EMAIL=<RLS 소유자 이메일>] [LOG_DIR=/tmp/cashflow-migration] \
#     bash scripts/migration/cutover.sh
#
# 전제(수동 확인):
#   1) 구 앱 쓰기 동결 완료
#   2) 백업 덤프 존재: $LOG_DIR/prod-backup-*.dump (없으면 즉시 중단)
#   3) DB_URL 은 session 모드(5432) — transaction 풀러(6543) 금지
#
# 실패 시: set -e 로 즉시 중단. 구 데이터는 legacy 스키마에 원본 그대로 있으므로
# 롤백 = 신 public 객체 DROP 후 legacy 테이블 SET SCHEMA public 복귀(또는 백업 복원).
set -euo pipefail

: "${DB_URL:?DB_URL 이 필요합니다 (session 모드 5432)}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_DIR="${LOG_DIR:-/tmp/cashflow-migration}"
TS="$(date +%Y%m%d-%H%M%S)"
PSQL=(psql "$DB_URL" -X -v ON_ERROR_STOP=1 -P pager=off)
T0=$SECONDS

step() { echo; echo "════ [$(date '+%H:%M:%S')] $1"; }

step "0. 사전 확인"
ls "$LOG_DIR"/prod-backup-*.dump >/dev/null 2>&1 \
  || { echo "FATAL: $LOG_DIR 에 prod-backup-*.dump 백업이 없습니다. 백업 없이 진행 금지."; exit 1; }
"${PSQL[@]}" -Atc "SELECT current_database() || ' / ' || version();" | head -1

step "1. 구 public → legacy 이동 (10_cutover_move_to_legacy.sql)"
"${PSQL[@]}" -f "$SCRIPT_DIR/10_cutover_move_to_legacy.sql"

step "2. 신 스키마 마이그레이션 적용 (supabase/migrations/*.sql, 파일명 순)"
for f in "$REPO_ROOT"/supabase/migrations/*.sql; do
  echo "  -- $(basename "$f")"
  "${PSQL[@]}" -q -f "$f"
done

step "2b. supabase CLI 마이그레이션 부기 기록 (향후 db push 정합)"
"${PSQL[@]}" -q <<'SQL'
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text NOT NULL PRIMARY KEY,
  statements text[],
  name text
);
SQL
for f in "$REPO_ROOT"/supabase/migrations/*.sql; do
  base="$(basename "$f" .sql)"
  version="${base%%_*}"
  name="${base#*_}"
  "${PSQL[@]}" -q -v v="$version" -v n="$name" <<'SQL'
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES (:'v', :'n') ON CONFLICT (version) DO NOTHING;
SQL
done
"${PSQL[@]}" -Atc "SELECT count(*) || ' migrations recorded' FROM supabase_migrations.schema_migrations;"

step "3. legacy → public 변환 (transform.sql, 멱등)"
"${PSQL[@]}" -f "$SCRIPT_DIR/transform.sql"

step "4. FIFO 재계산 보정 적용 (90_fifo_recompute_proposal.sql — 사용자 승인분)"
"${PSQL[@]}" -f "$SCRIPT_DIR/90_fifo_recompute_proposal.sql"

step "5. 4대 대사 (reconcile.sh)"
RECON="$LOG_DIR/recon-cutover-$TS.md"
if DB_URL="$DB_URL" bash "$SCRIPT_DIR/reconcile.sh" > "$RECON"; then
  echo "대사 ALL PASS"
else
  echo "대사 FAIL 항목 존재 — 예상된 차이인지 확인 필요:"
  echo "  · 2.1/2.2 ISA(+789,100): 파생값 채택 결정 — 예상된 차이"
  echo "  · 2.3 주식(−13,500): 구 저장값 이중계상 — 예상된 차이"
  echo "  · 3.1/3.2 알지노믹스 2건: FIFO 재계산 채택 — 의도적 차이"
  echo "  · 3.4/3.5 FIFO 불변식은 반드시 ALL PASS 여야 함"
fi
grep -E '^\*\*결과' "$RECON" || true
echo "리포트: $RECON"
# FIFO 불변식(3.4/3.5)과 결산(4.x) FAIL 은 허용 불가 — 자동 검증 (종합 요약 섹션 제외)
if sed -n '/### 3.4/,/## 4\./p' "$RECON" | grep -q FAIL; then
  echo "FATAL: FIFO 불변식 FAIL — 중단. 원인 분석 필요."; exit 1
fi
if sed -n '/## 4\./,/## 종합/p' "$RECON" | grep -q FAIL; then
  echo "FATAL: 결산 대사 FAIL — 중단. 원인 분석 필요."; exit 1
fi
# Row count 대사(1.x)도 필수 통과
if sed -n '/## 1\./,/## 2\./p' "$RECON" | grep -q 'FAIL'; then
  echo "FATAL: Row count 대사 FAIL — 중단. 원인 분석 필요."; exit 1
fi

step "6. RLS owner_email 설정"
if [ -z "${OWNER_EMAIL:-}" ]; then
  EMAILS="$("${PSQL[@]}" -Atc "SELECT email FROM auth.users WHERE email IS NOT NULL ORDER BY created_at;")"
  EMAIL_COUNT="$(printf '%s\n' "$EMAILS" | grep -c . || true)"
  if [ "$EMAIL_COUNT" -eq 1 ]; then
    OWNER_EMAIL="$EMAILS"
    echo "auth.users 단일 사용자 확인: $OWNER_EMAIL"
  else
    echo "FATAL: auth.users 사용자 수 ${EMAIL_COUNT}명 — OWNER_EMAIL 환경변수로 명시 필요."; exit 1
  fi
fi
# 커스텀 GUC 영구 설정은 롤 권한에 따라 거부될 수 있음(로컬 postgres 롤 등) —
# 실패해도 컷오버는 계속하되, RLS 는 fail-closed(미설정 = API 전부 거부)이므로
# 반드시 수동 조치로 마무리해야 함을 크게 알린다.
if ! "${PSQL[@]}" -q -v owner="$OWNER_EMAIL" <<'SQL'
SELECT format('ALTER DATABASE %I SET app.owner_email = %L', current_database(), :'owner') \gexec
SQL
then
  echo "########################################################################"
  echo "# 수동 조치 필요: app.owner_email 설정 실패(권한). Supabase SQL Editor 에서:"
  echo "#   ALTER DATABASE postgres SET app.owner_email = '$OWNER_EMAIL';"
  echo "# 설정 전까지 RLS fail-closed — API 전 요청 거부(안전) 상태."
  echo "########################################################################"
fi
"${PSQL[@]}" -Atc "SELECT 'app.owner_email = ' || COALESCE(
  (SELECT split_part(unnest, '=', 2) FROM (
     SELECT unnest(setconfig) FROM pg_db_role_setting s JOIN pg_database d ON d.oid = s.setdatabase
     WHERE d.datname = current_database() AND s.setrole = 0) u
   WHERE unnest LIKE 'app.owner_email=%'), '(미설정! — 수동 조치 필요)');"

step "7. 동결 기간 도래분 처리 + 자산 스냅샷 (수동 1회 실행, 시간 측정)"
"${PSQL[@]}" -c '\timing on' \
  -c "SELECT public.process_due_transactions();" \
  -c "SELECT public.snapshot_asset_valuations();"

step "8. 최종 확인"
"${PSQL[@]}" <<'SQL'
SELECT 'pg_cron jobs' AS item, count(*)::text AS value
FROM pg_extension e LEFT JOIN LATERAL (SELECT 1) x ON true
WHERE e.extname = 'pg_cron'
UNION ALL
SELECT 'legacy tables', count(*)::text FROM pg_tables WHERE schemaname = 'legacy'
UNION ALL
SELECT 'public tables', count(*)::text FROM pg_tables WHERE schemaname = 'public'
UNION ALL
SELECT 'public.transactions', count(*)::text FROM public.transactions
UNION ALL
SELECT 'public.investment_trades', count(*)::text FROM public.investment_trades;
SQL
# pg_cron 잡 상세 (cron.job 존재 시에만 — 서브쿼리 참조는 파스 타임 실패하므로 분기)
if [ "$("${PSQL[@]}" -Atc "SELECT to_regclass('cron.job') IS NOT NULL;")" = "t" ]; then
  "${PSQL[@]}" -c "SELECT jobname, schedule, command FROM cron.job ORDER BY jobname;"
else
  echo "pg_cron 미등록(cron.job 없음) — 원격(postgres DB)에서는 마이그레이션이 자동 등록. WARNING 로그 확인."
fi

echo
echo "════ 컷오버 완료. 총 소요: $((SECONDS - T0))초. 대사 리포트: $RECON"
echo "잊지 말 것(수동): Supabase 대시보드에서 Auth 신규 가입 비활성화, legacy 스키마 T+30일 후 삭제 판단"
