import "server-only"

import type postgres from "postgres"

import {
  averageMonthlyTotals,
  type RecurringItem,
} from "@/lib/forecast/cashflow-forecast"
import type { AssetInput } from "@/lib/forecast/asset-forecast"
import {
  buildForecastSeries,
  type ForecastSeriesInputs,
  type ForecastSeriesPoint,
} from "@/lib/forecast/forecast-series"
import {
  MAX_FORECAST_MONTHS,
  monthSpan,
  type CreateForecastScenarioParsed,
  type UpdateForecastScenarioInput,
} from "@/lib/validators"
import { ApiError } from "@/server/api-errors"
import { getDb } from "@/server/db/client"
import type { ForecastAssumptions, RecurringFrequency } from "@/types"
import type {
  ForecastResultDto,
  ForecastScenarioDto,
  RunForecastResponseDto,
  UpdatedForecastScenarioDto,
} from "@/types/api"

type Row = postgres.Row
type Sql = postgres.Sql

const SCENARIO_COLUMNS = `
  id, name, description, assumptions,
  start_date::text AS start_date, end_date::text AS end_date
`

function mapScenarioRow(row: Row): ForecastScenarioDto {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    assumptions: (row.assumptions as ForecastAssumptions | null) ?? null,
    startDate: row.start_date as string,
    endDate: row.end_date as string,
  }
}

function notFound(id: string): ApiError {
  return new ApiError(404, "NOT_FOUND", `시나리오를 찾을 수 없습니다: ${id}`)
}

/** GET /forecast/scenarios — 최근 생성 순 (API.md §13.1) */
export async function listScenarios(): Promise<ForecastScenarioDto[]> {
  const sql = getDb()
  const rows = await sql`
    SELECT ${sql.unsafe(SCENARIO_COLUMNS)}
    FROM forecast_scenarios
    ORDER BY created_at DESC
  `
  return rows.map(mapScenarioRow)
}

/** POST /forecast/scenarios — 단문 INSERT 1왕복 (API.md §13.2) */
export async function createScenario(
  input: CreateForecastScenarioParsed,
): Promise<ForecastScenarioDto> {
  const sql = getDb()
  const rows = await sql`
    INSERT INTO forecast_scenarios (name, description, assumptions, start_date, end_date)
    VALUES (
      ${input.name}, ${input.description},
      ${input.assumptions === null ? null : sql.json(input.assumptions)},
      ${input.startDate}, ${input.endDate}
    )
    RETURNING ${sql.unsafe(SCENARIO_COLUMNS)}
  `
  return mapScenarioRow(rows[0])
}

/** GET /forecast/scenarios/{id} (API.md §13.3) */
export async function getScenario(id: string): Promise<ForecastScenarioDto> {
  const sql = getDb()
  const rows = await sql`
    SELECT ${sql.unsafe(SCENARIO_COLUMNS)}
    FROM forecast_scenarios WHERE id = ${id}
  `
  if (rows.length === 0) throw notFound(id)
  return mapScenarioRow(rows[0])
}

/**
 * PATCH /forecast/scenarios/{id} — partial 수정 (API.md §13.4).
 * 수정 시 기존 결과는 시나리오 정의와 어긋난 스냅샷이 되므로 같은 트랜잭션에서
 * 삭제(무효화)하고 staleResults: true를 반환한다 — 클라이언트가 재실행을 유도.
 */
export async function updateScenario(
  id: string,
  input: UpdateForecastScenarioInput,
): Promise<UpdatedForecastScenarioDto> {
  const hasField = Object.values(input).some((value) => value !== undefined)
  if (!hasField) {
    throw new ApiError(400, "VALIDATION_ERROR", "수정할 필드가 없습니다")
  }

  const sql = getDb()
  const scenario = await sql.begin(async (tx) => {
    const rows = await tx`
      UPDATE forecast_scenarios SET
        name       = COALESCE(${input.name ?? null}, name),
        description = CASE WHEN ${input.description !== undefined}
                        THEN ${input.description ?? null} ELSE description END,
        assumptions = CASE WHEN ${input.assumptions !== undefined}
                        THEN ${input.assumptions ? tx.json(input.assumptions) : null}
                        ELSE assumptions END,
        start_date = COALESCE(${input.startDate ?? null}, start_date),
        end_date   = COALESCE(${input.endDate ?? null}, end_date)
      WHERE id = ${id}
      RETURNING ${tx.unsafe(SCENARIO_COLUMNS)}
    `
    if (rows.length === 0) throw notFound(id)

    const updated = mapScenarioRow(rows[0])
    // 저장 값 기준 기간 상한 재검증 — 부분 수정으로 우회되는 조합 차단 (롤백)
    if (monthSpan(updated.startDate, updated.endDate) > MAX_FORECAST_MONTHS) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        `예측 기간은 최대 ${MAX_FORECAST_MONTHS}개월입니다`,
      )
    }

    await tx`DELETE FROM forecast_results WHERE scenario_id = ${id}`
    return updated
  })

  return { ...scenario, staleResults: true }
}

/** DELETE /forecast/scenarios/{id} — 결과는 FK CASCADE (API.md §13.5) */
export async function deleteScenario(id: string): Promise<{ id: string }> {
  const sql = getDb()
  const rows = await sql`
    DELETE FROM forecast_scenarios WHERE id = ${id} RETURNING id
  `
  if (rows.length === 0) throw notFound(id)
  return { id: rows[0].id as string }
}

/**
 * run 입력 수집 (API.md §13.6 구현 메모).
 * 정기 거래·자산 트랙은 병렬 개발 중 — 테이블 미존재 시 빈 입력으로 degrade
 * (to_regclass 피처 감지, 병합 후 자동 활성).
 */
async function loadRunInputs(sql: Sql): Promise<ForecastSeriesInputs> {
  const [monthlyRows, balanceRows, featureRows] = await Promise.all([
    sql`
      SELECT type, sum(amount)::float8 AS total
      FROM transactions
      WHERE type IN ('income', 'expense')
        AND status = 'applied'
        AND date >= (date_trunc('month', now()) - interval '12 months')::date
      GROUP BY to_char(date, 'YYYY-MM'), type
    `,
    // 자산 연결 계좌(asset_id 有)는 asset_values_v에서 집계 — 이중 계상 방지
    sql`
      SELECT COALESCE(SUM(b.current_balance), 0)::float8 AS total
      FROM accounts a
      JOIN account_balances_v b ON b.account_id = a.id
      WHERE a.is_active AND a.asset_id IS NULL
    `,
    sql`
      SELECT
        to_regclass('public.recurring_transactions') IS NOT NULL AS has_recurring,
        to_regclass('public.asset_values_v') IS NOT NULL AS has_assets
    `,
  ])

  const { avgIncome, avgExpense } = averageMonthlyTotals(
    monthlyRows.map((row) => ({
      type: row.type as "income" | "expense",
      total: Number(row.total),
    })),
  )

  const recurrings = featureRows[0].has_recurring
    ? await loadRecurrings(sql)
    : []
  const { assets, assetCategoryNames } = featureRows[0].has_assets
    ? await loadAssets(sql)
    : { assets: [], assetCategoryNames: new Map<string, string>() }

  return {
    cashflow: { avgIncome, avgExpense, recurrings },
    startingBalance: Number(balanceRows[0].total),
    assets,
    assetCategoryNames,
  }
}

async function loadRecurrings(sql: Sql): Promise<RecurringItem[]> {
  const rows = await sql`
    SELECT type, amount::float8 AS amount, frequency, recur_interval,
           next_date::text AS next_date, start_date::text AS start_date,
           end_date::text AS end_date
    FROM recurring_transactions
    WHERE is_active AND type IN ('income', 'expense')
  `
  return rows.map((row) => ({
    type: row.type as "income" | "expense",
    amount: Number(row.amount),
    frequency: row.frequency as RecurringFrequency,
    interval: Number(row.recur_interval),
    nextDate: row.next_date as string,
    startDate: row.start_date as string,
    endDate: (row.end_date as string | null) ?? null,
  }))
}

async function loadAssets(sql: Sql): Promise<{
  assets: AssetInput[]
  assetCategoryNames: Map<string, string>
}> {
  const rows = await sql`
    SELECT a.id, a.name, av.current_value::float8 AS current_value,
           a.asset_category_id, ac.name AS category_name
    FROM assets a
    JOIN asset_values_v av ON av.asset_id = a.id
    JOIN asset_categories ac ON ac.id = a.asset_category_id
    WHERE a.is_active
  `
  const assetCategoryNames = new Map<string, string>()
  const assets = rows.map((row) => {
    assetCategoryNames.set(row.asset_category_id as string, row.category_name as string)
    return {
      id: row.id as string,
      name: row.name as string,
      currentValue: Number(row.current_value),
      assetCategoryId: row.asset_category_id as string,
    }
  })
  return { assets, assetCategoryNames }
}

function toResultDto(point: ForecastSeriesPoint): ForecastResultDto {
  return {
    ym: point.ym,
    projectedIncome: point.projectedIncome,
    projectedExpense: point.projectedExpense,
    projectedCashflow: point.projectedBalance,
    projectedNetWorth: point.projectedNetWorth,
    goalProgress: null, // 목표 금액은 비저장 — UI가 클라이언트에서 계산 (PRD §3.9)
  }
}

/**
 * POST /forecast/run — 입력 조회 → TS 순수 함수 계산 → 결과 배치 저장 (API.md §13.6).
 * 결과 저장은 파생 비저장 원칙의 문서화된 예외 — "실행 시점 스냅샷" (DB.md §1.8).
 */
export async function runForecast(scenarioId: string): Promise<RunForecastResponseDto> {
  const sql = getDb()
  const scenario = await getScenario(scenarioId)

  // 저장 값 기준 방어적 재검증 (validator와 이중)
  if (monthSpan(scenario.startDate, scenario.endDate) > MAX_FORECAST_MONTHS) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      `예측 기간은 최대 ${MAX_FORECAST_MONTHS}개월입니다`,
    )
  }

  const inputs = await loadRunInputs(sql)
  const series = buildForecastSeries(
    scenario.startDate,
    scenario.endDate,
    scenario.assumptions,
    inputs,
  )

  // 삭제 + 배치 INSERT 1왕복 — 재실행 멱등 (uq_forecast_results_scenario_date)
  await sql.begin(async (tx) => {
    await tx`DELETE FROM forecast_results WHERE scenario_id = ${scenarioId}`
    await tx`
      INSERT INTO forecast_results
        (scenario_id, date, projected_income, projected_expense,
         projected_balance, projected_net_worth, details)
      SELECT ${scenarioId},
             (point->>'ym' || '-01')::date,
             (point->>'projectedIncome')::bigint,
             (point->>'projectedExpense')::bigint,
             (point->>'projectedBalance')::bigint,
             (point->>'projectedNetWorth')::bigint,
             point->'details'
      FROM jsonb_array_elements(${tx.json(series as unknown as postgres.JSONValue)}) AS point
    `
  })

  return { scenarioId, results: series.map(toResultDto) }
}

/** GET /forecast/results — 저장 스냅샷 조회, 없으면 빈 배열 (API.md §13.7) */
export async function listResults(scenarioId: string): Promise<ForecastResultDto[]> {
  const sql = getDb()
  const rows = await sql`
    SELECT to_char(date, 'YYYY-MM') AS ym,
           projected_income::float8 AS projected_income,
           projected_expense::float8 AS projected_expense,
           projected_balance::float8 AS projected_balance,
           projected_net_worth::float8 AS projected_net_worth
    FROM forecast_results
    WHERE scenario_id = ${scenarioId}
    ORDER BY date
  `
  return rows.map((row) => ({
    ym: row.ym as string,
    projectedIncome: Number(row.projected_income),
    projectedExpense: Number(row.projected_expense),
    projectedCashflow: Number(row.projected_balance),
    projectedNetWorth: Number(row.projected_net_worth),
    goalProgress: null,
  }))
}
