import { describe, expect, test } from "vitest"

import { qk } from "@/lib/query-keys"

describe("query key factory", () => {
  test("month keys share the transactions prefix (prefix invalidation)", () => {
    const key = qk.transactions.month("2026-07")

    expect(key).toEqual(["transactions", "month", "2026-07"])
    expect(key.slice(0, 1)).toEqual(qk.transactions.all)
  })

  test("list keys embed filter, page, and limit for cache identity", () => {
    const filter = { type: "expense" as const }

    expect(qk.transactions.list(filter, 2, 50)).toEqual([
      "transactions",
      "list",
      filter,
      2,
      50,
    ])
  })

  test("dashboard and settlements are keyed by year-month granularity", () => {
    expect(qk.dashboard.month("2026-07")).toEqual([
      "dashboard",
      "month",
      "2026-07",
    ])
    expect(qk.settlements.monthly("2026-07")).toEqual([
      "settlements",
      "monthly",
      "2026-07",
    ])
    expect(qk.settlements.annual(2026)).toEqual(["settlements", "annual", 2026])
  })

  test("budget keys cover list/actuals/annual-grid/summary", () => {
    expect(qk.budgets.list(2026)).toEqual(["budgets", "list", 2026])
    expect(qk.budgets.actuals("2026-07")).toEqual([
      "budgets",
      "actuals",
      "2026-07",
    ])
    expect(qk.budgets.annualGrid(2026)).toEqual([
      "budgets",
      "annual-grid",
      2026,
    ])
    expect(qk.budgets.summary(2026)).toEqual(["budgets", "summary", 2026])
  })

  test("asset filter defaults to an empty object", () => {
    expect(qk.assets.list()).toEqual(["assets", "list", {}])
  })

  test("categories list defaults to 'all' when no type given", () => {
    expect(qk.categories.list()).toEqual(["categories", "list", "all"])
    expect(qk.categories.list("income")).toEqual([
      "categories",
      "list",
      "income",
    ])
  })

  test("trade keys share the investment-trades prefix", () => {
    expect(qk.trades.annual(2026)).toEqual(["investment-trades", "annual", 2026])
    expect(qk.trades.annual(2026).slice(0, 1)).toEqual(qk.trades.all)
  })

  test("transaction/account/tag detail keys are keyed by id", () => {
    expect(qk.transactions.detail("tx-1")).toEqual([
      "transactions",
      "detail",
      "tx-1",
    ])
    expect(qk.accounts.list()).toEqual(["accounts", "list"])
    expect(qk.accounts.detail("acc-1")).toEqual(["accounts", "detail", "acc-1"])
    expect(qk.tags.search("커피")).toEqual(["tags", "search", "커피"])
  })

  test("budget detail is keyed by id", () => {
    expect(qk.budgets.detail("b-1")).toEqual(["budgets", "detail", "b-1"])
  })

  test("asset keys cover list/detail/valuations/portfolio and categories", () => {
    const filter = { categoryId: "c-1" }
    expect(qk.assets.list(filter)).toEqual(["assets", "list", filter])
    expect(qk.assets.detail("a-1")).toEqual(["assets", "detail", "a-1"])
    expect(qk.assets.valuations("a-1")).toEqual(["assets", "valuations", "a-1"])
    expect(qk.assets.portfolio()).toEqual(["assets", "portfolio"])
    expect(qk.assetCategories.list()).toEqual(["asset-categories", "list"])
  })

  test("trade list/summary/tickers embed their filters", () => {
    const range = { from: "2026-01-01", to: "2026-12-31" }
    expect(qk.trades.list({ assetId: "a-1" }, 1)).toEqual([
      "investment-trades",
      "list",
      { assetId: "a-1" },
      1,
    ])
    expect(qk.trades.summary(range)).toEqual([
      "investment-trades",
      "summary",
      range,
    ])
    expect(qk.trades.tickers(range)).toEqual([
      "investment-trades",
      "tickers",
      range,
    ])
  })

  test("recurring and forecast keys", () => {
    expect(qk.recurring.list()).toEqual(["recurring", "list"])
    expect(qk.recurring.detail("r-1")).toEqual(["recurring", "detail", "r-1"])
    expect(qk.forecast.scenarios()).toEqual(["forecast", "scenarios"])
    expect(qk.forecast.results("s-1")).toEqual(["forecast", "results", "s-1"])
  })

  test("report keys cover trend/categories/net-worth", () => {
    expect(qk.reports.trend("2026-01", "2026-06")).toEqual([
      "reports",
      "trend",
      "2026-01",
      "2026-06",
    ])
    expect(qk.reports.categories("2026-07")).toEqual([
      "reports",
      "categories",
      "2026-07",
    ])
    expect(qk.reports.netWorth(12)).toEqual(["reports", "net-worth", 12])
  })
})
