-- 00_to_uuid.sql — 결정적 uuid 변환 헬퍼 (MIGRATION.md §2)
-- 전제: legacy 스키마가 적재된 DB 에서 실행 (idempotent)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE OR REPLACE FUNCTION legacy.to_uuid(t text)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN t IS NULL THEN NULL
    WHEN t ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN t::uuid
    -- 프로젝트 고정 네임스페이스 (uuid_ns_url() 등 범용 네임스페이스 금지)
    ELSE uuid_generate_v5('6f7a0d1e-2b3c-4d5e-8f90-1a2b3c4d5e6f'::uuid, 'cashflow:' || t)
  END
$$;
