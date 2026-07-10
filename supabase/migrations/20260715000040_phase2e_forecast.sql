-- Phase 2E: forecast_scenarios / forecast_results (DB.md §1.8)
-- 예측 결과는 파생값이지만 "시나리오 실행 시점의 스냅샷"이라는 사실(fact) 성격 —
-- 저장 유지(파생 비저장 원칙의 문서화된 예외). 계산은 TS 순수 함수(src/lib/forecast).

-- 1. 테이블
CREATE TABLE public.forecast_scenarios (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  assumptions jsonb,
  start_date  date NOT NULL,
  end_date    date NOT NULL CHECK (end_date > start_date),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.forecast_results (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id         uuid NOT NULL REFERENCES public.forecast_scenarios(id) ON DELETE CASCADE,
  date                date NOT NULL,
  projected_income    bigint NOT NULL,
  projected_expense   bigint NOT NULL,
  projected_balance   bigint NOT NULL,
  projected_net_worth bigint NOT NULL,
  details             jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_forecast_results_scenario_date UNIQUE (scenario_id, date)
);

CREATE TRIGGER trg_forecast_scenarios_updated_at
  BEFORE UPDATE ON public.forecast_scenarios
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_forecast_results_updated_at
  BEFORE UPDATE ON public.forecast_results
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. 인덱스 (DB.md §4 — uq_forecast_results_scenario_date는 UNIQUE 제약으로 자동 생성)
CREATE INDEX idx_forecast_results_scenario_id ON public.forecast_results (scenario_id);

-- 3. RLS — phase1과 동일한 소유자 정책 (DB.md §5)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['forecast_scenarios','forecast_results'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I_owner_all ON public.%I
         FOR ALL TO authenticated
         USING (auth.jwt()->>''email'' = current_setting(''app.owner_email'', true))
         WITH CHECK (auth.jwt()->>''email'' = current_setting(''app.owner_email'', true))', t, t);
  END LOOP;
END $$;

-- 4. 권한 — anon은 phase1의 전역 REVOKE 이후 신규 테이블에도 기본 권한이 없으나
--    default privileges가 변경될 가능성에 대비해 명시적으로 차단한다 (fail-closed).
REVOKE ALL ON public.forecast_scenarios, public.forecast_results FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.forecast_scenarios, public.forecast_results
  TO authenticated;
