import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest"

const getAuthUserMock = vi.fn(async () => ({
  id: "test-user",
  email: "owner@local.test",
}))

vi.mock("@/server/auth", () => ({
  getAuthUser: () => getAuthUserMock(),
}))

import {
  GET as listScenarios,
  POST as postScenario,
} from "@/app/api/v1/forecast/scenarios/route"
import {
  DELETE as deleteScenario,
  GET as getScenario,
  PATCH as patchScenario,
} from "@/app/api/v1/forecast/scenarios/[id]/route"
import { POST as runForecast } from "@/app/api/v1/forecast/run/route"
import { GET as getResults } from "@/app/api/v1/forecast/results/route"
import { closeDb } from "@/server/db/client"

import {
  createTestDb,
  truncateAssetInvestmentCore,
  truncateForecast,
  truncateTransactionCore,
} from "./helpers/db"

const sql = createTestDb()

afterAll(async () => {
  await sql.end()
  await closeDb()
})

beforeEach(async () => {
  getAuthUserMock.mockResolvedValue({ id: "test-user", email: "owner@local.test" })
  await truncateForecast(sql)
  await truncateAssetInvestmentCore(sql)
  await truncateTransactionCore(sql)
})

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const idParams = (id: string) => ({ params: Promise.resolve({ id }) })

/** 오늘 기준 ym 산술 (YYYY-MM) */
function shiftYm(offsetMonths: number): string {
  const date = new Date()
  date.setDate(1)
  date.setMonth(date.getMonth() + offsetMonths)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

function lastDayOfYm(ym: string): string {
  const [year, month] = ym.split("-").map(Number)
  return `${ym}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`
}

const VALID_SCENARIO = {
  name: "기본 시나리오",
  startDate: `${shiftYm(0)}-01`,
  endDate: lastDayOfYm(shiftYm(2)),
}

async function createScenario(overrides: Record<string, unknown> = {}) {
  const response = await postScenario(
    jsonRequest("/api/v1/forecast/scenarios", "POST", {
      ...VALID_SCENARIO,
      ...overrides,
    }),
  )
  return { response, body: await response.json() }
}

/** 지난달 수입 300만/지출 100만 시드 — 평균 계산 근거 */
async function seedHistory(): Promise<void> {
  const [account] = await sql`
    INSERT INTO accounts (name, type, initial_balance, sort_order)
    VALUES ('예측은행', 'bank', 100000, 0) RETURNING id
  `
  const lastMonth = `${shiftYm(-1)}-15`
  await sql`
    INSERT INTO transactions (type, amount, description, date, account_id, status) VALUES
      ('income', 3000000, '급여', ${lastMonth}, ${account.id as string}, 'applied'),
      ('expense', 1000000, '생활비', ${lastMonth}, ${account.id as string}, 'applied')
  `
}

describe("POST /api/v1/forecast/scenarios", () => {
  test("시나리오 생성 → 201, API.md §13.1 필드", async () => {
    const { response, body } = await createScenario({
      description: "보수적 가정",
      assumptions: { incomeGrowthRate: 3, expenseGrowthRate: 2 },
    })

    expect(response.status).toBe(201)
    expect(body.data).toMatchObject({
      name: "기본 시나리오",
      description: "보수적 가정",
      assumptions: { incomeGrowthRate: 3, expenseGrowthRate: 2 },
      startDate: VALID_SCENARIO.startDate,
      endDate: VALID_SCENARIO.endDate,
    })
    expect(body.data.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  test("종료일 ≤ 시작일 → 400 VALIDATION_ERROR", async () => {
    const { response, body } = await createScenario({
      endDate: VALID_SCENARIO.startDate,
    })
    expect(response.status).toBe(400)
    expect(body.error.code).toBe("VALIDATION_ERROR")
  })

  test("미인증 → 401", async () => {
    getAuthUserMock.mockResolvedValue(null as never)
    const { response } = await createScenario()
    expect(response.status).toBe(401)
  })
})

describe("GET /api/v1/forecast/scenarios", () => {
  test("최근 생성 순 목록", async () => {
    await createScenario({ name: "첫번째" })
    await createScenario({ name: "두번째" })

    const response = await listScenarios()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.map((s: { name: string }) => s.name)).toEqual([
      "두번째",
      "첫번째",
    ])
  })

  test("빈 목록 → []", async () => {
    const response = await listScenarios()
    const body = await response.json()
    expect(body.data).toEqual([])
  })
})

describe("GET /api/v1/forecast/scenarios/{id}", () => {
  test("단건 조회", async () => {
    const { body: created } = await createScenario()
    const response = await getScenario(
      jsonRequest(`/api/v1/forecast/scenarios/${created.data.id}`, "GET"),
      idParams(created.data.id),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.id).toBe(created.data.id)
  })

  test("없는 id → 404 NOT_FOUND", async () => {
    const response = await getScenario(
      jsonRequest("/api/v1/forecast/scenarios/x", "GET"),
      idParams("00000000-0000-0000-0000-000000000000"),
    )
    const body = await response.json()
    expect(response.status).toBe(404)
    expect(body.error.code).toBe("NOT_FOUND")
  })
})

describe("PATCH /api/v1/forecast/scenarios/{id}", () => {
  test("부분 수정 → staleResults: true, 기존 결과 무효(삭제)", async () => {
    await seedHistory()
    const { body: created } = await createScenario()
    const id = created.data.id as string

    // 결과 생성 후 수정
    await runForecast(jsonRequest("/api/v1/forecast/run", "POST", { scenarioId: id }))

    const response = await patchScenario(
      jsonRequest(`/api/v1/forecast/scenarios/${id}`, "PATCH", { name: "수정됨" }),
      idParams(id),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toMatchObject({ id, name: "수정됨", staleResults: true })

    // 결과는 무효화되어 빈 배열 (run 유도, API.md §13.7)
    const resultsResponse = await getResults(
      jsonRequest(`/api/v1/forecast/results?scenarioId=${id}`, "GET"),
    )
    const results = await resultsResponse.json()
    expect(results.data).toEqual([])
  })

  test("없는 id → 404", async () => {
    const response = await patchScenario(
      jsonRequest("/api/v1/forecast/scenarios/x", "PATCH", { name: "수정" }),
      idParams("00000000-0000-0000-0000-000000000000"),
    )
    expect(response.status).toBe(404)
  })

  test("빈 본문(수정 필드 없음) → 400", async () => {
    const { body: created } = await createScenario()
    const response = await patchScenario(
      jsonRequest(`/api/v1/forecast/scenarios/${created.data.id}`, "PATCH", {}),
      idParams(created.data.id),
    )
    expect(response.status).toBe(400)
  })

  test("날짜 역전 본문 → 400", async () => {
    const { body: created } = await createScenario()
    const response = await patchScenario(
      jsonRequest(`/api/v1/forecast/scenarios/${created.data.id}`, "PATCH", {
        startDate: "2027-01-01",
        endDate: "2026-01-01",
      }),
      idParams(created.data.id),
    )
    expect(response.status).toBe(400)
  })

  test("시작일만 당겨 120개월 초과 조합 → 400 + 롤백 (validator 우회 차단)", async () => {
    // 생성 시점엔 119개월로 유효
    const { body: created } = await createScenario({
      startDate: "2030-01-01",
      endDate: "2039-12-01",
    })
    const id = created.data.id as string

    // startDate만 PATCH — Zod refine은 한쪽 필드만 오면 통과하므로 서비스 재검증이 막아야 한다
    const response = await patchScenario(
      jsonRequest(`/api/v1/forecast/scenarios/${id}`, "PATCH", {
        startDate: "2020-01-01",
      }),
      idParams(id),
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error.code).toBe("VALIDATION_ERROR")

    // 트랜잭션 롤백 — 시나리오는 원래 값 유지
    const after = await getScenario(
      jsonRequest(`/api/v1/forecast/scenarios/${id}`, "GET"),
      idParams(id),
    )
    const afterBody = await after.json()
    expect(afterBody.data.startDate).toBe("2030-01-01")
  })
})

describe("DELETE /api/v1/forecast/scenarios/{id}", () => {
  test("삭제 → 200 { id }, 결과 CASCADE", async () => {
    await seedHistory()
    const { body: created } = await createScenario()
    const id = created.data.id as string
    await runForecast(jsonRequest("/api/v1/forecast/run", "POST", { scenarioId: id }))

    const response = await deleteScenario(
      jsonRequest(`/api/v1/forecast/scenarios/${id}`, "DELETE"),
      idParams(id),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toEqual({ id })

    const remaining = await sql`
      SELECT count(*)::int AS count FROM forecast_results WHERE scenario_id = ${id}
    `
    expect(remaining[0].count).toBe(0)
  })

  test("없는 id → 404", async () => {
    const response = await deleteScenario(
      jsonRequest("/api/v1/forecast/scenarios/x", "DELETE"),
      idParams("00000000-0000-0000-0000-000000000000"),
    )
    expect(response.status).toBe(404)
  })
})

describe("POST /api/v1/forecast/run", () => {
  test("이력 평균 기반 계산 + 결과 저장 (API.md §13.6)", async () => {
    await seedHistory()
    const { body: created } = await createScenario()
    const id = created.data.id as string

    const response = await runForecast(
      jsonRequest("/api/v1/forecast/run", "POST", { scenarioId: id }),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.scenarioId).toBe(id)
    expect(body.data.results).toHaveLength(3)

    // 평균: 수입 300만 / 지출 100만 (성장률 없음), 시작 잔액 = 10만 + 300만 - 100만
    const [first, second, third] = body.data.results
    expect(first).toMatchObject({
      ym: shiftYm(0),
      projectedIncome: 3000000,
      projectedExpense: 1000000,
      projectedCashflow: 2100000 + 2000000,
      goalProgress: null,
    })
    expect(second.projectedCashflow).toBe(2100000 + 4000000)
    expect(third.projectedCashflow).toBe(2100000 + 6000000)
    // 자산 트랙 미병합 상태 → 순자산 = 누적 현금
    expect(first.projectedNetWorth).toBe(first.projectedCashflow)

    // DB 저장 확인 (스냅샷 예외 — DB.md §1.8)
    const stored = await sql`
      SELECT count(*)::int AS count FROM forecast_results WHERE scenario_id = ${id}
    `
    expect(stored[0].count).toBe(3)
  })

  test("재실행 시 기존 결과를 대체한다 (멱등)", async () => {
    await seedHistory()
    const { body: created } = await createScenario()
    const id = created.data.id as string

    await runForecast(jsonRequest("/api/v1/forecast/run", "POST", { scenarioId: id }))
    const response = await runForecast(
      jsonRequest("/api/v1/forecast/run", "POST", { scenarioId: id }),
    )
    expect(response.status).toBe(200)

    const stored = await sql`
      SELECT count(*)::int AS count FROM forecast_results WHERE scenario_id = ${id}
    `
    expect(stored[0].count).toBe(3)
  })

  test("거래 이력이 없어도 실행된다 (평균 0)", async () => {
    const { body: created } = await createScenario()
    const response = await runForecast(
      jsonRequest("/api/v1/forecast/run", "POST", { scenarioId: created.data.id }),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.results[0]).toMatchObject({
      projectedIncome: 0,
      projectedExpense: 0,
      projectedCashflow: 0,
    })
  })

  test("자산 연결 계좌(asset_id 有)는 시작 잔액에서 제외 — 이중 계상 방지", async () => {
    await seedHistory()
    // 자산 연결 계좌 500만원 — asset_values_v에서 집계될 몫이므로 현금 잔액에서 제외
    // (2C 병합으로 fk_accounts_asset_id 가 부착됨 — 실제 자산 행을 먼저 생성)
    const [assetCategory] = await sql`
      INSERT INTO asset_categories (name, kind)
      VALUES ('금융자산', 'financial') RETURNING id
    `
    const [asset] = await sql`
      INSERT INTO assets (name, asset_category_id, acquisition_date, acquisition_cost)
      VALUES ('연금', ${assetCategory.id}, '2026-01-01', 5000000) RETURNING id
    `
    await sql`
      INSERT INTO accounts (name, type, initial_balance, sort_order, asset_id)
      VALUES ('연금계좌', 'investment', 5000000, 9, ${asset.id})
    `
    const { body: created } = await createScenario()

    const response = await runForecast(
      jsonRequest("/api/v1/forecast/run", "POST", { scenarioId: created.data.id }),
    )
    const body = await response.json()

    // 시작 잔액 2,100,000 (연금계좌 5,000,000 미포함) + 월 순이익 2,000,000
    expect(body.data.results[0].projectedCashflow).toBe(2100000 + 2000000)
  })

  test("정기 수입·자산 현재가치가 실스키마에서 자동 반영된다 (피처 감지 활성)", async () => {
    await seedHistory()
    const [account] = await sql`SELECT id FROM accounts WHERE name = '예측은행'`
    await sql`
      INSERT INTO recurring_transactions
        (type, amount, description, account_id, frequency, recur_interval,
         start_date, next_date)
      VALUES ('income', 500000, '정기수입', ${account.id}, 'monthly', 1,
              ${`${shiftYm(-12)}-01`}, ${`${shiftYm(0)}-01`})
    `
    const [assetCategory] = await sql`
      INSERT INTO asset_categories (name, kind)
      VALUES ('금융자산', 'financial') RETURNING id
    `
    // 연동 계좌·평가이력 없음 → asset_values_v 는 취득원가 10,000,000 으로 평가
    await sql`
      INSERT INTO assets (name, asset_category_id, acquisition_date, acquisition_cost)
      VALUES ('펀드', ${assetCategory.id}, '2026-01-01', 10000000)
    `
    const { body: created } = await createScenario()

    const response = await runForecast(
      jsonRequest("/api/v1/forecast/run", "POST", { scenarioId: created.data.id }),
    )
    const body = await response.json()
    const [first] = body.data.results

    expect(response.status).toBe(200)
    // 이력 평균 300만 + 정기 수입 50만
    expect(first.projectedIncome).toBe(3500000)
    // 순자산 = 누적 현금 + 자산 투영(monthIndex 0 → 현재가치 그대로)
    expect(first.projectedNetWorth).toBe(first.projectedCashflow + 10000000)
  })

  test("없는 시나리오 → 404", async () => {
    const response = await runForecast(
      jsonRequest("/api/v1/forecast/run", "POST", {
        scenarioId: "00000000-0000-0000-0000-000000000000",
      }),
    )
    expect(response.status).toBe(404)
  })

  test("본문 검증 실패 → 400", async () => {
    const response = await runForecast(
      jsonRequest("/api/v1/forecast/run", "POST", { scenarioId: "not-a-uuid" }),
    )
    expect(response.status).toBe(400)
  })
})

describe("GET /api/v1/forecast/results", () => {
  test("run 전 → 빈 배열 (run 유도)", async () => {
    const { body: created } = await createScenario()
    const response = await getResults(
      jsonRequest(`/api/v1/forecast/results?scenarioId=${created.data.id}`, "GET"),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toEqual([])
  })

  test("run 후 저장된 결과를 ym 오름차순으로 반환", async () => {
    await seedHistory()
    const { body: created } = await createScenario()
    const id = created.data.id as string
    const runResponse = await runForecast(
      jsonRequest("/api/v1/forecast/run", "POST", { scenarioId: id }),
    )
    const runBody = await runResponse.json()

    const response = await getResults(
      jsonRequest(`/api/v1/forecast/results?scenarioId=${id}`, "GET"),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toEqual(runBody.data.results)
    expect(body.data.map((r: { ym: string }) => r.ym)).toEqual([
      shiftYm(0),
      shiftYm(1),
      shiftYm(2),
    ])
  })

  test("scenarioId 누락 → 400", async () => {
    const response = await getResults(
      jsonRequest("/api/v1/forecast/results", "GET"),
    )
    expect(response.status).toBe(400)
  })
})

/**
 * 정기·자산 트랙 병합 후 활성화될 피처 감지(loadRunInputs)의 "존재" 분기 검증.
 * 실제 트랙 테이블이 이미 있으면(병합 후) 픽스처 생성을 건너뛰고 그대로 사용하지 않고
 * 스킵한다 — 스키마 드리프트로 인한 오탐 방지. 미존재 시 서비스가 조회하는 최소
 * 스키마만 생성 후 정리한다.
 */
describe("POST /api/v1/forecast/run — 정기·자산 입력 반영 (피처 감지)", () => {
  let createdFixtures = false

  beforeAll(async () => {
    const [flags] = await sql`
      SELECT to_regclass('public.recurring_transactions') IS NOT NULL AS has_recurring,
             to_regclass('public.asset_values_v') IS NOT NULL AS has_assets
    `
    if (flags.has_recurring || flags.has_assets) return

    await sql`
      CREATE TABLE public.recurring_transactions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        type text NOT NULL, amount bigint NOT NULL,
        frequency text NOT NULL, recur_interval integer NOT NULL DEFAULT 1,
        start_date date NOT NULL, end_date date, next_date date NOT NULL,
        is_active boolean NOT NULL DEFAULT true
      )
    `
    await sql`
      CREATE TABLE public.asset_categories (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL
      )
    `
    await sql`
      CREATE TABLE public.assets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
        asset_category_id uuid NOT NULL REFERENCES public.asset_categories(id),
        is_active boolean NOT NULL DEFAULT true, current_value bigint NOT NULL
      )
    `
    await sql`
      CREATE VIEW public.asset_values_v AS
      SELECT id AS asset_id, current_value, is_active FROM public.assets
    `
    createdFixtures = true
  })

  afterAll(async () => {
    if (!createdFixtures) return
    await sql`DROP VIEW IF EXISTS public.asset_values_v`
    await sql`DROP TABLE IF EXISTS public.assets`
    await sql`DROP TABLE IF EXISTS public.asset_categories`
    await sql`DROP TABLE IF EXISTS public.recurring_transactions`
  })

  test("정기 수입과 자산 현재가치가 예측에 반영된다", async (ctx) => {
    if (!createdFixtures) return ctx.skip() // 실제 트랙 병합 후엔 해당 트랙 테스트가 담당

    await seedHistory()
    await sql`
      INSERT INTO recurring_transactions
        (type, amount, frequency, recur_interval, start_date, next_date)
      VALUES ('income', 500000, 'monthly', 1,
              ${`${shiftYm(-12)}-01`}, ${`${shiftYm(0)}-01`})
    `
    const [category] = await sql`
      INSERT INTO asset_categories (name) VALUES ('금융자산') RETURNING id
    `
    await sql`
      INSERT INTO assets (name, asset_category_id, current_value)
      VALUES ('펀드', ${category.id as string}, 10000000)
    `
    const { body: created } = await createScenario()

    const response = await runForecast(
      jsonRequest("/api/v1/forecast/run", "POST", { scenarioId: created.data.id }),
    )
    const body = await response.json()
    const [first] = body.data.results

    expect(response.status).toBe(200)
    // 이력 평균 300만 + 정기 수입 50만
    expect(first.projectedIncome).toBe(3500000)
    // 순자산 = 누적 현금 + 자산 투영(monthIndex 0 → 현재가치 그대로)
    expect(first.projectedNetWorth).toBe(first.projectedCashflow + 10000000)
  })
})
