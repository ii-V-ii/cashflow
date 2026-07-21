import { describe, expect, test } from "vitest"

import { hashKey } from "@tanstack/react-query"

import { qk } from "@/lib/query-keys"
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
  type PrefetchEntry,
} from "@/server/prefetch-entries"

/**
 * 하이드레이션 정합의 핵심: RSC가 프리페치하는 키가 각 화면의 클라이언트 훅이
 * 계산하는 키와 해시까지 동일해야 한다 (1바이트라도 다르면 이중 페치).
 * 기대 키는 화면 컴포넌트의 계산 로직을 그대로 재현해 만든다.
 */

function hashes(entries: readonly PrefetchEntry[]): string[] {
  return entries.map((entry) => hashKey(entry.queryKey as unknown[]))
}

function expectKeys(
  entries: readonly PrefetchEntry[],
  expected: readonly (readonly unknown[])[],
): void {
  expect(hashes(entries).sort()).toEqual(
    expected.map((key) => hashKey(key as unknown[])).sort(),
  )
}

describe("currentYmSeoul", () => {
  test("Asia/Seoul 기준 'YYYY-MM' 형식", () => {
    expect(currentYmSeoul()).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/)
  })
})

describe("dashboardPrefetchEntries — 홈", () => {
  test("현재 월 get_dashboard 1건 (useDashboard 키와 일치)", () => {
    const entries = dashboardPrefetchEntries()

    expectKeys(entries, [qk.dashboard.month(currentYmSeoul())])
  })
})

describe("transactionsPrefetchEntries — 거래", () => {
  test("기본 진입: 월 원장(1페이지) + 월 결산 + 계좌 + 지출 카테고리 (화면 훅 키와 일치)", () => {
    const ym = currentYmSeoul()

    const entries = transactionsPrefetchEntries({})

    // 화면: useTransactionsMonth(ym, 1), useMonthlySettlement(ym), 폼: useAccounts(), useCategories("expense")
    expectKeys(entries, [
      qk.transactions.monthPage(ym, 1),
      qk.settlements.monthly(ym),
      qk.accounts.list(),
      qk.categories.list("expense"),
    ])
  })

  test("ym 파라미터를 그대로 반영한다 (1페이지 키)", () => {
    const entries = transactionsPrefetchEntries({ ym: "2026-03" })

    expect(hashes(entries)).toContain(hashKey(qk.transactions.monthPage("2026-03", 1)))
    expect(hashes(entries)).toContain(hashKey(qk.settlements.monthly("2026-03")))
  })

  test("비필터 + page=2: monthPage(ym, 2)로 프리페치한다 (화면 훅 useTransactionsMonth(ym, page)와 일치 — 이중 페치 방지)", () => {
    const ym = currentYmSeoul()
    const entries = transactionsPrefetchEntries({ page: "2" })

    const keys = hashes(entries)
    expect(keys).toContain(hashKey(qk.transactions.monthPage(ym, 2)))
    // page 1 키는 만들어지지 않는다 — 클라이언트는 실제 page(2)만 구독한다
    expect(keys).not.toContain(hashKey(qk.transactions.monthPage(ym, 1)))
    // 결산은 페이지와 무관하게 월 단위이므로 그대로 유지된다
    expect(keys).toContain(hashKey(qk.settlements.monthly(ym)))
  })

  test("필터 진입: 화면의 list 키({ type, search: search || undefined }, page, 20)와 해시 일치, 월 원장·월 결산은 게이팅된다", () => {
    const ym = currentYmSeoul()
    const entries = transactionsPrefetchEntries({
      type: "expense",
      search: "커피",
      page: "2",
    })

    // transactions-screen.tsx의 필터 객체 구성({ type, search: search || undefined }) 재현
    const screenListKey = qk.transactions.list(
      { type: "expense", search: "커피" },
      2,
      20,
    )
    const keys = hashes(entries)
    expect(keys).toContain(hashKey(screenListKey))
    // 필터 모드에서는 월 원장·월 결산 프리페치가 불필요하다 (화면 훅의 enabled: tab==='all' && !isFiltered 재현)
    expect(keys).not.toContain(hashKey(qk.transactions.monthPage(ym, 1)))
    expect(keys).not.toContain(hashKey(qk.settlements.monthly(ym)))
  })

  test("type만 있는 필터도 list 키 해시가 일치한다 (undefined 필드 해시 동등성)", () => {
    const entries = transactionsPrefetchEntries({ type: "income" })

    const screenListKey = qk.transactions.list(
      { type: "income", search: undefined },
      1,
      20,
    )
    expect(hashes(entries)).toContain(hashKey(screenListKey))
  })

  test("정기 탭 진입: 월 원장·월 결산 대신 정기 규칙 목록", () => {
    const entries = transactionsPrefetchEntries({ tab: "recurring" })

    const keys = hashes(entries)
    expect(keys).toContain(hashKey(qk.recurring.list()))
    expect(keys).not.toContain(
      hashKey(qk.transactions.monthPage(currentYmSeoul(), 1)),
    )
    expect(keys).not.toContain(hashKey(qk.settlements.monthly(currentYmSeoul())))
  })

  test("잘못된 ym/type/page는 해당 엔트리만 조용히 제외한다 (클라이언트 페치 폴백)", () => {
    const entries = transactionsPrefetchEntries({
      ym: "2026-13",
      type: "hack",
      page: "abc",
    })

    // 월 원장·월 결산·필터 목록은 제외되지만 계좌·카테고리는 유지
    expectKeys(entries, [qk.accounts.list(), qk.categories.list("expense")])
  })
})

describe("budgetsPrefetchEntries — 예산", () => {
  test("월별 탭(기본): actuals(ym) + list(year)", () => {
    const ym = currentYmSeoul()
    const year = Number(ym.slice(0, 4))

    const entries = budgetsPrefetchEntries({})

    expectKeys(entries, [qk.budgets.actuals(ym), qk.budgets.list(year)])
  })

  test("ym·year 파라미터 반영 — year는 ym에서 파생(화면 로직 재현)", () => {
    const entries = budgetsPrefetchEntries({ ym: "2025-11" })

    expectKeys(entries, [qk.budgets.actuals("2025-11"), qk.budgets.list(2025)])
  })

  test("월별 탭은 URL year를 무시하고 ym의 연도를 쓴다 (MonthlyBudget 로직 재현)", () => {
    // 탭 전환 잔여물로 ym·year가 함께 있을 수 있다 — MonthlyBudget은 ym에서 연도 파생
    const entries = budgetsPrefetchEntries({ ym: "2026-07", year: "2024" })

    expectKeys(entries, [qk.budgets.actuals("2026-07"), qk.budgets.list(2026)])
  })

  test("연간 그리드 탭: annualGrid(year)", () => {
    const entries = budgetsPrefetchEntries({ tab: "grid", year: "2025" })

    expectKeys(entries, [qk.budgets.annualGrid(2025)])
  })

  test("연간 개요 탭: summary(year)", () => {
    const year = Number(currentYmSeoul().slice(0, 4))

    const entries = budgetsPrefetchEntries({ tab: "overview" })

    expectKeys(entries, [qk.budgets.summary(year)])
  })

  test("비정상 year는 엔트리를 만들지 않는다", () => {
    const entries = budgetsPrefetchEntries({ tab: "grid", year: "abc" })

    expect(entries).toEqual([])
  })
})

describe("settlementsPrefetchEntries — 결산", () => {
  test("월별 탭(기본): monthly(ym)", () => {
    const ym = currentYmSeoul()

    const entries = settlementsPrefetchEntries({})

    expectKeys(entries, [qk.settlements.monthly(ym)])
  })

  test("연간 탭: annual(year)", () => {
    const entries = settlementsPrefetchEntries({ tab: "annual", year: "2025" })

    expectKeys(entries, [qk.settlements.annual(2025)])
  })
})

describe("assetsPrefetchEntries — 자산", () => {
  test("목록(무필터) + 포트폴리오 + 자산 카테고리 (useAssets(undefined) 키와 해시 일치)", () => {
    const entries = assetsPrefetchEntries()

    // assets-screen.tsx: kindTab 'all' → useAssets(undefined)
    expectKeys(entries, [
      qk.assets.list(undefined),
      qk.assets.portfolio(),
      qk.assetCategories.list(),
    ])
  })
})

describe("investmentsPrefetchEntries — 투자", () => {
  test("자산 목록 + 매매 1페이지 (useTrades({}, 1) 키와 해시 일치)", () => {
    const entries = investmentsPrefetchEntries()

    // investments-screen.tsx: assetFilter '' → filter {}, page 1
    expectKeys(entries, [qk.assets.list(undefined), qk.trades.list({}, 1)])
  })
})

describe("forecastPrefetchEntries — 예측", () => {
  test("시나리오 목록", () => {
    const entries = forecastPrefetchEntries()

    expectKeys(entries, [qk.forecast.scenarios()])
  })
})

describe("reportsPrefetchEntries — 보고서", () => {
  /** reports-screen.tsx rangeOf 재현 */
  function rangeOf(to: string, months: number): { from: string; to: string } {
    const [year, month] = to.split("-").map(Number)
    const fromDate = new Date(year, month - 1 - (months - 1), 1)
    const from = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, "0")}`
    return { from, to }
  }

  test("기본 진입: 추이(최근 12개월) + 카테고리 도넛 + 순자산", () => {
    const ym = currentYmSeoul()
    const { from, to } = rangeOf(ym, 12)

    const entries = reportsPrefetchEntries({})

    expectKeys(entries, [
      qk.reports.trend(from, to),
      qk.reports.categories(ym),
      qk.reports.netWorth(12),
    ])
  })

  test("months=6 반영, 허용되지 않는 months는 12로 폴백 (화면 로직 재현)", () => {
    const six = reportsPrefetchEntries({ ym: "2026-05", months: "6" })
    expect(hashes(six)).toContain(hashKey(qk.reports.netWorth(6)))
    expect(hashes(six)).toContain(
      hashKey(qk.reports.trend(rangeOf("2026-05", 6).from, "2026-05")),
    )

    const fallback = reportsPrefetchEntries({ months: "7" })
    expect(hashes(fallback)).toContain(hashKey(qk.reports.netWorth(12)))
  })

  test("잘못된 ym은 추이·카테고리 엔트리를 제외한다", () => {
    const entries = reportsPrefetchEntries({ ym: "garbage" })

    expectKeys(entries, [qk.reports.netWorth(12)])
  })
})

describe("accountsPrefetchEntries / categoriesPrefetchEntries", () => {
  test("계좌: accounts.list", () => {
    expectKeys(accountsPrefetchEntries(), [qk.accounts.list()])
  })

  test("카테고리: 기본 탭 expense 목록", () => {
    expectKeys(categoriesPrefetchEntries(), [qk.categories.list("expense")])
  })
})
