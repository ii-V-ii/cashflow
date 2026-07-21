import { afterAll, beforeEach, describe, expect, test, vi } from "vitest"

const getAuthUserMock = vi.fn(async () => ({
  id: "test-user",
  email: "owner@local.test",
}))

vi.mock("@/server/auth", () => ({
  getAuthUser: () => getAuthUserMock(),
}))

import { hashKey } from "@tanstack/react-query"

import { GET as listAccountsRoute } from "@/app/api/v1/accounts/route"
import { GET as getMonthlySettlementRoute } from "@/app/api/v1/settlements/monthly/route"
import {
  GET as listTransactionsRoute,
  POST as postTransactionRoute,
} from "@/app/api/v1/transactions/route"
import { closeDb } from "@/server/db/client"
import { prefetchDehydratedState } from "@/server/prefetch"
import {
  accountsPrefetchEntries,
  assetsPrefetchEntries,
  budgetsPrefetchEntries,
  categoriesPrefetchEntries,
  currentYmSeoul,
  dashboardPrefetchEntries,
  forecastPrefetchEntries,
  investmentsPrefetchEntries,
  reportsPrefetchEntries,
  settlementsPrefetchEntries,
  transactionsPrefetchEntries,
} from "@/server/prefetch-entries"
import { qk } from "@/lib/query-keys"

import { createTestDb, truncateTransactionCore } from "./helpers/db"

/**
 * SSR 프리페치 하이드레이션 정합 통합 테스트 (거래 화면 대표):
 * RSC가 서비스 직접 호출로 dehydrate한 데이터가, 클라이언트 훅이 REST 라우트로
 * 받는 envelope 언랩 데이터와 완전히 동일해야 한다 — 다르면 하이드레이션 미스.
 */
const sql = createTestDb()

afterAll(async () => {
  await sql.end()
  await closeDb()
})

let bankId: string
let foodCategoryId: string

beforeEach(async () => {
  await truncateTransactionCore(sql)

  const accounts = await sql`
    INSERT INTO public.accounts (name, type, initial_balance, sort_order)
    VALUES ('프리페치은행', 'bank', 50000, 0)
    RETURNING id
  `
  bankId = accounts[0].id

  const categories = await sql`
    INSERT INTO public.categories (name, type, expense_kind)
    VALUES ('식비', 'expense', 'consumption')
    RETURNING id
  `
  foodCategoryId = categories[0].id
})

function findDehydratedData(
  state: { queries: { queryHash: string; state: { data?: unknown } }[] },
  key: readonly unknown[],
): unknown {
  return state.queries.find((query) => query.queryHash === hashKey(key as unknown[]))
    ?.state.data
}

async function envelopeData(response: Response): Promise<unknown> {
  const body = (await response.json()) as { success: boolean; data: unknown }
  expect(body.success).toBe(true)
  return body.data
}

describe("거래 화면 SSR 프리페치 정합", () => {
  test("dehydrate된 월 원장(1페이지)·계좌·월 결산 데이터가 REST 응답 data와 동일하다", async () => {
    const ym = currentYmSeoul()

    // 현재 월에 속하는 거래 1건 생성 (RPC 경유 — 실제 서비스 경로)
    const created = await postTransactionRoute(
      new Request("http://test/api/v1/transactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "expense",
          amount: 12000,
          description: "프리페치점심",
          categoryId: foodCategoryId,
          accountId: bankId,
          date: `${ym}-05`,
        }),
      }),
    )
    expect(created.status).toBe(201)

    // RSC 프리페치 (서비스 직접 호출)
    const state = await prefetchDehydratedState(transactionsPrefetchEntries({}))
    expect(state).not.toBeNull()

    // 클라이언트 훅이 받을 REST 응답 (getTransactionsMonth(ym, 1)과 동일 쿼리스트링 — limit 20)
    const [year, month] = ym.split("-").map(Number)
    const lastDay = new Date(year, month, 0).getDate()
    const monthUrl =
      `http://test/api/v1/transactions?from=${ym}-01` +
      `&to=${ym}-${String(lastDay).padStart(2, "0")}&page=1&limit=20`
    const restMonth = await envelopeData(
      await listTransactionsRoute(new Request(monthUrl)),
    )
    const restAccounts = await envelopeData(await listAccountsRoute())
    const restSettlement = await envelopeData(
      await getMonthlySettlementRoute(
        new Request(`http://test/api/v1/settlements/monthly?year=${year}&month=${month}`),
      ),
    )

    expect(findDehydratedData(state!, qk.transactions.monthPage(ym, 1))).toEqual(
      restMonth,
    )
    expect(findDehydratedData(state!, qk.accounts.list())).toEqual(restAccounts)
    expect(findDehydratedData(state!, qk.settlements.monthly(ym))).toEqual(
      restSettlement,
    )

    // 실제 데이터가 실렸는지 (빈 배열 동등성으로 통과하는 가짜 green 방지)
    const monthPage = restMonth as { items: { description: string }[]; total: number }
    expect(monthPage.total).toBe(1)
    expect(monthPage.items[0]?.description).toBe("프리페치점심")

    const settlement = restSettlement as { expense: { total: number } }
    expect(settlement.expense.total).toBe(12000)
  })
})

describe("전 메뉴 엔트리 smoke — queryFn이 실제 DB에서 해석된다", () => {
  const builders: [string, () => { queryFn: () => Promise<unknown> }[]][] = [
    ["홈", () => dashboardPrefetchEntries()],
    ["거래(필터)", () => transactionsPrefetchEntries({ type: "expense", search: "점심" })],
    ["거래(정기 탭)", () => transactionsPrefetchEntries({ tab: "recurring" })],
    ["예산(월별)", () => budgetsPrefetchEntries({})],
    ["예산(그리드)", () => budgetsPrefetchEntries({ tab: "grid" })],
    ["예산(개요)", () => budgetsPrefetchEntries({ tab: "overview" })],
    ["결산(월별)", () => settlementsPrefetchEntries({})],
    ["결산(연간)", () => settlementsPrefetchEntries({ tab: "annual" })],
    ["자산", () => assetsPrefetchEntries()],
    ["투자", () => investmentsPrefetchEntries()],
    ["예측", () => forecastPrefetchEntries()],
    ["보고서", () => reportsPrefetchEntries({})],
    ["계좌", () => accountsPrefetchEntries()],
    ["카테고리", () => categoriesPrefetchEntries()],
  ]

  test.each(builders)("%s 프리페치 쿼리 전부 성공", async (_label, build) => {
    const entries = build()
    expect(entries.length).toBeGreaterThan(0)

    const results = await Promise.all(entries.map((entry) => entry.queryFn()))
    for (const result of results) {
      expect(result).toBeDefined()
    }
  })
})
