import { describe, expect, test } from "vitest"

import {
  defaultTrendRange,
  fillTrendMonths,
  monthRange,
} from "@/server/services/report-mapping"

describe("defaultTrendRange (API.md §14.1 — 기본 최근 12개월)", () => {
  test("현재 월 포함 최근 12개월을 돌려준다", () => {
    expect(defaultTrendRange(new Date(2026, 6, 10))).toEqual({
      from: "2025-08",
      to: "2026-07",
    })
  })

  test("연 경계를 넘는 계산 — 1월 기준", () => {
    expect(defaultTrendRange(new Date(2026, 0, 31))).toEqual({
      from: "2025-02",
      to: "2026-01",
    })
  })
})

describe("monthRange — 'YYYY-MM' 구간 → [시작일, 종료 경계일)", () => {
  test("from 월초와 to 익월초를 돌려준다", () => {
    expect(monthRange("2025-08", "2026-07")).toEqual({
      start: "2025-08-01",
      endExclusive: "2026-08-01",
    })
  })

  test("12월 → 익년 1월 경계", () => {
    expect(monthRange("2026-01", "2026-12")).toEqual({
      start: "2026-01-01",
      endExclusive: "2027-01-01",
    })
  })
})

describe("fillTrendMonths — 데이터 없는 구간 0 채움 (PRD §3.10)", () => {
  test("빠진 달을 0으로 채우고 net을 파생한다", () => {
    const rows = [
      { ym: "2026-02", income: 300000, expense: 120000, saving: 50000 },
    ]
    expect(fillTrendMonths("2026-01", "2026-03", rows)).toEqual([
      { ym: "2026-01", income: 0, expense: 0, saving: 0, net: 0 },
      { ym: "2026-02", income: 300000, expense: 120000, saving: 50000, net: 180000 },
      { ym: "2026-03", income: 0, expense: 0, saving: 0, net: 0 },
    ])
  })

  test("연 경계를 넘는 구간도 이어서 채운다", () => {
    const months = fillTrendMonths("2025-11", "2026-02", [])
    expect(months.map((m) => m.ym)).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ])
  })
})
