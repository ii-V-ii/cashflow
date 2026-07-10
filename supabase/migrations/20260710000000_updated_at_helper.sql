-- Phase 0: 공용 트리거 함수만 정의 (docs/DB.md §1.0)
-- 비즈니스 로직 트리거는 금지 — updated_at 갱신만 예외.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- 각 테이블 생성 직후 아래 형식으로 부착한다(updated_at 보유 테이블 전부):
--
-- CREATE TRIGGER trg_<table>_updated_at
--   BEFORE UPDATE ON public.<table>
--   FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
