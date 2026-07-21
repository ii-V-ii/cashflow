import "server-only"

import { TRANSACTIONS_PAGE_SIZE } from "@/features/transactions/constants"
import { qk } from "@/lib/query-keys"
import {
  budgetActualsQuerySchema,
  budgetsListQuerySchema,
  annualGridQuerySchema,
  budgetSummaryQuerySchema,
  dashboardQuerySchema,
  listAssetsQuerySchema,
  listCategoriesQuerySchema,
  listTradesQuerySchema,
  listTransactionsQuerySchema,
  reportCategoriesQuerySchema,
  reportNetWorthQuerySchema,
  reportTrendQuerySchema,
  settlementAnnualQuerySchema,
  settlementMonthlyQuerySchema,
} from "@/lib/validators"
import { listAccounts } from "@/server/services/account-service"
import { listAssetCategories } from "@/server/services/asset-category-service"
import { getPortfolio, listAssets } from "@/server/services/asset-service"
import {
  getAnnualGrid,
  getBudgetActuals,
  getBudgetSummary,
  listBudgets,
} from "@/server/services/budget-service"
import { listCategories } from "@/server/services/category-service"
import { getDashboard } from "@/server/services/dashboard-service"
import { listScenarios } from "@/server/services/forecast-service"
import { listTrades } from "@/server/services/investment-trade-service"
import { listRecurring } from "@/server/services/recurring-service"
import {
  getCategoryReport,
  getNetWorthReport,
  getTrendReport,
} from "@/server/services/report-service"
import {
  getAnnualSettlement,
  getMonthlySettlement,
} from "@/server/services/settlement-service"
import { listTransactions } from "@/server/services/transaction-service"
import type { PrefetchEntry } from "@/server/prefetch"

/**
 * 화면(메뉴)별 프리페치 엔트리 빌더 — 각 클라이언트 훅이 계산하는 쿼리 키를
 * 그대로 재현한다. 키가 1바이트라도 다르면 하이드레이션 미스 → 이중 페치.
 * searchParams 정규화(기본값·탭 분기)는 해당 화면 컴포넌트 로직과 1:1이다.
 *
 * 비정상 파라미터는 엔트리를 만들지 않는다(조용히 제외) — 클라이언트가
 * 기존과 동일하게 직접 페치하며 422 에러 UI를 담당한다.
 */

export type RawSearchParams = Record<string, string | string[] | undefined>

const YM_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

/** useSearchParams().get()과 동일 — 중복 파라미터는 첫 값 */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/**
 * Asia/Seoul 기준 현재 'YYYY-MM'.
 * 클라이언트 화면들의 currentYm()은 브라우저 로컬 시간을 쓰므로(KST 사용자 전제),
 * UTC로 도는 서버에서는 서울 시간대로 맞춰야 월 경계(1일 00~09시 KST)에서도
 * 키가 일치한다. 불일치 시에도 클라이언트 페치로 폴백될 뿐 깨지지 않는다.
 */
export function currentYmSeoul(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date())
  const year = parts.find((part) => part.type === "year")?.value
  const month = parts.find((part) => part.type === "month")?.value
  return `${year}-${month}`
}

function resolveYm(sp: RawSearchParams): string {
  return first(sp.ym) ?? currentYmSeoul()
}

/** 화면 공통: year = Number(sp.year ?? ym.slice(0, 4)) */
function resolveYear(sp: RawSearchParams, ym: string): number {
  return Number(first(sp.year) ?? ym.slice(0, 4))
}

/** 홈 — useDashboard(currentYm) (home-screen.tsx) */
export function dashboardPrefetchEntries(): PrefetchEntry[] {
  const ym = currentYmSeoul()
  const [year, month] = ym.split("-").map(Number)
  const parsed = dashboardQuerySchema.safeParse({ year, month })
  if (!parsed.success) return []
  return [
    { queryKey: qk.dashboard.month(ym), queryFn: () => getDashboard(parsed.data) },
  ]
}

/** 거래 — 월 원장(또는 필터 목록/정기 규칙) + 월 결산 + 폼용 계좌·지출 카테고리 */
export function transactionsPrefetchEntries(sp: RawSearchParams): PrefetchEntry[] {
  const entries: PrefetchEntry[] = []
  const tab = first(sp.tab) === "recurring" ? "recurring" : "all"
  const ym = resolveYm(sp)
  const type = first(sp.type)
  const search = first(sp.search) ?? ""
  const page = Number(first(sp.page) ?? "1")
  const isFiltered = Boolean(type || search)

  if (tab === "recurring") {
    entries.push({ queryKey: qk.recurring.list(), queryFn: listRecurring })
  } else {
    // 필터 모드에서는 월 원장·월 결산이 불필요하다 — 화면 훅의
    // enabled: tab==='all' && !isFiltered 조건을 그대로 재현해 게이팅한다.
    if (!isFiltered && YM_PATTERN.test(ym)) {
      const [year, month] = ym.split("-").map(Number)
      const lastDay = new Date(year, month, 0).getDate()
      // useTransactionsMonth(ym, page) — getTransactionsMonth와 동일한 from/to/page/limit.
      // 실제 URL의 page를 그대로 써야 한다 — 하드코딩된 1을 쓰면 클라이언트가 구독하는
      // page(딥링크·페이지 이동)와 어긋나 SSR 프리페치가 무의미해지고 클라가 이중 페치한다.
      const parsed = listTransactionsQuerySchema.safeParse({
        from: `${ym}-01`,
        to: `${ym}-${String(lastDay).padStart(2, "0")}`,
        page,
        limit: TRANSACTIONS_PAGE_SIZE,
      })
      if (parsed.success) {
        entries.push({
          queryKey: qk.transactions.monthPage(ym, page),
          queryFn: () => listTransactions(parsed.data),
        })
      }
      // useMonthlySettlement(ym) — 상단 요약 카드
      const settlementParsed = settlementMonthlyQuerySchema.safeParse({ year, month })
      if (settlementParsed.success) {
        entries.push({
          queryKey: qk.settlements.monthly(ym),
          queryFn: () => getMonthlySettlement(settlementParsed.data),
        })
      }
    }
    // useTransactionsList({ type, search: search || undefined }, page, TRANSACTIONS_PAGE_SIZE)
    if (isFiltered) {
      const parsed = listTransactionsQuerySchema.safeParse({
        type,
        search: search || undefined,
        page,
        limit: TRANSACTIONS_PAGE_SIZE,
      })
      if (parsed.success) {
        entries.push({
          queryKey: qk.transactions.list(
            { type: parsed.data.type, search: parsed.data.search },
            page,
            TRANSACTIONS_PAGE_SIZE,
          ),
          queryFn: () => listTransactions(parsed.data),
        })
      }
    }
  }

  // 거래 폼(TransactionForm) — useAccounts() + useCategories("expense" 기본)
  entries.push({ queryKey: qk.accounts.list(), queryFn: listAccounts })
  entries.push(...categoriesPrefetchEntries())
  return entries
}

/** 예산 — 탭별 1차 쿼리 (budgets-screen.tsx: monthly | grid | overview) */
export function budgetsPrefetchEntries(sp: RawSearchParams): PrefetchEntry[] {
  const entries: PrefetchEntry[] = []
  const tabParam = first(sp.tab)
  const tab = tabParam === "grid" || tabParam === "overview" ? tabParam : "monthly"
  const ym = resolveYm(sp)
  const year = resolveYear(sp, ym)

  if (tab === "monthly") {
    // MonthlyBudget — useBudgetActuals(ym) + useBudgets(ym에서 파생한 연도)
    // URL year는 grid/overview 탭 전용 — MonthlyBudget은 ym.split의 연도를 쓴다
    if (YM_PATTERN.test(ym)) {
      const [ymYear, month] = ym.split("-").map(Number)
      const parsedActuals = budgetActualsQuerySchema.safeParse({ year: ymYear, month })
      if (parsedActuals.success) {
        entries.push({
          queryKey: qk.budgets.actuals(ym),
          queryFn: () => getBudgetActuals(parsedActuals.data),
        })
      }
      const parsedList = budgetsListQuerySchema.safeParse({ year: ymYear })
      if (parsedList.success) {
        entries.push({
          queryKey: qk.budgets.list(ymYear),
          queryFn: () => listBudgets(parsedList.data),
        })
      }
    }
  } else if (tab === "grid") {
    const parsed = annualGridQuerySchema.safeParse({ year })
    if (parsed.success) {
      entries.push({
        queryKey: qk.budgets.annualGrid(year),
        queryFn: () => getAnnualGrid(parsed.data),
      })
    }
  } else {
    const parsed = budgetSummaryQuerySchema.safeParse({ year })
    if (parsed.success) {
      entries.push({
        queryKey: qk.budgets.summary(year),
        queryFn: () => getBudgetSummary(parsed.data),
      })
    }
  }
  return entries
}

/** 결산 — monthly(ym) | annual(year) (settlements-screen.tsx) */
export function settlementsPrefetchEntries(sp: RawSearchParams): PrefetchEntry[] {
  const ym = resolveYm(sp)
  const year = resolveYear(sp, ym)

  if (first(sp.tab) === "annual") {
    const parsed = settlementAnnualQuerySchema.safeParse({ year })
    if (!parsed.success) return []
    return [
      {
        queryKey: qk.settlements.annual(year),
        queryFn: () => getAnnualSettlement(parsed.data),
      },
    ]
  }

  if (!YM_PATTERN.test(ym)) return []
  const [monthYear, month] = ym.split("-").map(Number)
  const parsed = settlementMonthlyQuerySchema.safeParse({ year: monthYear, month })
  if (!parsed.success) return []
  return [
    {
      queryKey: qk.settlements.monthly(ym),
      queryFn: () => getMonthlySettlement(parsed.data),
    },
  ]
}

/** 자산 — 목록(무필터=useAssets(undefined)) + 포트폴리오 + 자산 카테고리 */
export function assetsPrefetchEntries(): PrefetchEntry[] {
  const parsed = listAssetsQuerySchema.parse({}) // activeOnly 기본 true
  return [
    { queryKey: qk.assets.list(undefined), queryFn: () => listAssets(parsed) },
    { queryKey: qk.assets.portfolio(), queryFn: getPortfolio },
    { queryKey: qk.assetCategories.list(), queryFn: listAssetCategories },
  ]
}

/** 투자 — 자산 목록 + 매매 1페이지 (useTrades({}, 1), limit 20 기본) */
export function investmentsPrefetchEntries(): PrefetchEntry[] {
  const assetsParsed = listAssetsQuerySchema.parse({})
  const tradesParsed = listTradesQuerySchema.parse({}) // page 1, limit 20 기본
  return [
    { queryKey: qk.assets.list(undefined), queryFn: () => listAssets(assetsParsed) },
    { queryKey: qk.trades.list({}, 1), queryFn: () => listTrades(tradesParsed) },
  ]
}

/** 예측 — 시나리오 목록 (결과는 시나리오 선택 후 조회) */
export function forecastPrefetchEntries(): PrefetchEntry[] {
  return [{ queryKey: qk.forecast.scenarios(), queryFn: listScenarios }]
}

/** reports-screen.tsx PERIODS/rangeOf 재현 */
const REPORT_PERIODS: readonly number[] = [6, 12, 24]

function reportRangeOf(to: string, months: number): { from: string; to: string } {
  const [year, month] = to.split("-").map(Number)
  const fromDate = new Date(year, month - 1 - (months - 1), 1)
  const from = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, "0")}`
  return { from, to }
}

/** 보고서 — 추이 + 카테고리 도넛 + 순자산 (3종 모두 첫 렌더에 조회) */
export function reportsPrefetchEntries(sp: RawSearchParams): PrefetchEntry[] {
  const entries: PrefetchEntry[] = []
  const ym = resolveYm(sp)
  const monthsParam = Number(first(sp.months) ?? "12")
  const months = REPORT_PERIODS.includes(monthsParam) ? monthsParam : 12

  if (YM_PATTERN.test(ym)) {
    const { from, to } = reportRangeOf(ym, months)
    const trendParsed = reportTrendQuerySchema.safeParse({ from, to })
    if (trendParsed.success) {
      entries.push({
        queryKey: qk.reports.trend(from, to),
        queryFn: () => getTrendReport(trendParsed.data),
      })
    }
    const [year, month] = ym.split("-").map(Number)
    const categoryParsed = reportCategoriesQuerySchema.safeParse({ year, month })
    if (categoryParsed.success) {
      entries.push({
        queryKey: qk.reports.categories(ym),
        queryFn: () => getCategoryReport(categoryParsed.data),
      })
    }
  }

  const netWorthParsed = reportNetWorthQuerySchema.safeParse({ months })
  if (netWorthParsed.success) {
    entries.push({
      queryKey: qk.reports.netWorth(months),
      queryFn: () => getNetWorthReport(netWorthParsed.data),
    })
  }
  return entries
}

/** 계좌 — accounts ⋈ account_balances_v 목록 */
export function accountsPrefetchEntries(): PrefetchEntry[] {
  return [{ queryKey: qk.accounts.list(), queryFn: listAccounts }]
}

/** 카테고리 — 기본 탭 expense 목록 (categories-screen.tsx) */
export function categoriesPrefetchEntries(): PrefetchEntry[] {
  const parsed = listCategoriesQuerySchema.parse({ type: "expense" })
  return [
    {
      queryKey: qk.categories.list("expense"),
      queryFn: () => listCategories(parsed),
    },
  ]
}

export type { PrefetchEntry }
