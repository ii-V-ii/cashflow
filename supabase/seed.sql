-- 로컬/CI 시드 데이터. 각 기능 트랙에서 채운다.

-- [RLS 소유자 이메일 — docs/DB.md §5]
-- 정책은 auth.jwt()->>'email' = current_setting('app.owner_email', true) 를 검증한다.
-- 미설정 시 current_setting(..., true)가 NULL을 반환해 정책이 전부 거부(fail-closed)된다.
-- 시드 롤(postgres)은 커스텀 GUC를 영구 설정할 권한이 없어 여기서 실행하지 않는다.
-- 로컬에서 PostgREST 경로(anon/authenticated)를 테스트하려면 supabase_admin으로 1회 실행:
--   psql "postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres" \
--     -c "ALTER DATABASE postgres SET app.owner_email = 'owner@local.test';"
-- 운영 컷오버 시에는 실제 소유자 이메일로 동일하게 설정한다(MIGRATION.md §7).
