import type {
  AssetFilter,
  TradeFilter,
  TradeRangeFilter,
  TransactionFilter,
} from "@/types"

/**
 * 쿼리 키 팩토리 — 단일 정의 (ARCHITECTURE.md §6.1).
 * 문자열 키 직접 사용 금지. ym: 'YYYY-MM' — 월 단위 무효화의 기본 입자.
 */
export const qk = {
  transactions: {
    all: ["transactions"] as const,
    list: (filter: TransactionFilter, page: number, limit: number) =>
      [...qk.transactions.all, "list", filter, page, limit] as const,
    month: (ym: string) => [...qk.transactions.all, "month", ym] as const,
    detail: (id: string) => [...qk.transactions.all, "detail", id] as const,
  },
  accounts: {
    all: ["accounts"] as const,
    list: () => [...qk.accounts.all, "list"] as const, // accounts ⋈ account_balances_v
    detail: (id: string) => [...qk.accounts.all, "detail", id] as const,
  },
  categories: {
    all: ["categories"] as const,
    list: (type?: "income" | "expense") =>
      [...qk.categories.all, "list", type ?? "all"] as const,
  },
  tags: {
    all: ["tags"] as const,
    search: (q: string) => [...qk.tags.all, "search", q] as const,
  },
  budgets: {
    all: ["budgets"] as const,
    list: (year: number) => [...qk.budgets.all, "list", year] as const,
    detail: (id: string) => [...qk.budgets.all, "detail", id] as const,
    actuals: (ym: string) => [...qk.budgets.all, "actuals", ym] as const, // get_budget_actuals
    annualGrid: (year: number) =>
      [...qk.budgets.all, "annual-grid", year] as const,
    summary: (year: number) => [...qk.budgets.all, "summary", year] as const,
  },
  settlements: {
    all: ["settlements"] as const,
    monthly: (ym: string) => [...qk.settlements.all, "monthly", ym] as const,
    annual: (year: number) => [...qk.settlements.all, "annual", year] as const,
  },
  dashboard: {
    all: ["dashboard"] as const,
    month: (ym: string) => [...qk.dashboard.all, "month", ym] as const, // get_dashboard
  },
  assets: {
    all: ["assets"] as const,
    list: (filter?: AssetFilter) =>
      [...qk.assets.all, "list", filter ?? {}] as const,
    detail: (id: string) => [...qk.assets.all, "detail", id] as const,
    valuations: (id: string) => [...qk.assets.all, "valuations", id] as const,
    portfolio: () => [...qk.assets.all, "portfolio"] as const,
  },
  assetCategories: {
    all: ["asset-categories"] as const,
    list: () => [...qk.assetCategories.all, "list"] as const,
  },
  trades: {
    all: ["investment-trades"] as const,
    list: (filter: TradeFilter, page: number) =>
      [...qk.trades.all, "list", filter, page] as const,
    summary: (filter: TradeRangeFilter) =>
      [...qk.trades.all, "summary", filter] as const,
    tickers: (filter: TradeRangeFilter) =>
      [...qk.trades.all, "tickers", filter] as const,
    annual: (year: number) => [...qk.trades.all, "annual", year] as const,
  },
  recurring: {
    all: ["recurring"] as const,
    list: () => [...qk.recurring.all, "list"] as const,
    detail: (id: string) => [...qk.recurring.all, "detail", id] as const,
  },
  forecast: {
    all: ["forecast"] as const,
    scenarios: () => [...qk.forecast.all, "scenarios"] as const,
    results: (scenarioId: string) =>
      [...qk.forecast.all, "results", scenarioId] as const,
  },
  reports: {
    all: ["reports"] as const,
    trend: (from: string, to: string) =>
      [...qk.reports.all, "trend", from, to] as const,
    categories: (ym: string) => [...qk.reports.all, "categories", ym] as const,
    netWorth: (months: number) =>
      [...qk.reports.all, "net-worth", months] as const,
  },
} as const
