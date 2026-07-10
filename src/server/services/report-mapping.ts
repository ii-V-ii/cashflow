/**
 * 보고서(API.md §14) 기간 계산 순수 함수 — DB 접근 없음 (단위 테스트 대상).
 */

const TREND_DEFAULT_MONTHS = 12

function ymString(year: number, monthIndex: number): string {
  const date = new Date(year, monthIndex, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

/** 기본 추이 구간 — 현재 월 포함 최근 12개월 (API.md §14.1) */
export function defaultTrendRange(now: Date): { from: string; to: string } {
  return {
    from: ymString(now.getFullYear(), now.getMonth() - (TREND_DEFAULT_MONTHS - 1)),
    to: ymString(now.getFullYear(), now.getMonth()),
  }
}

export interface RawTrendRow {
  ym: string
  income: number
  expense: number
  saving: number
}

export interface TrendMonth extends RawTrendRow {
  net: number
}

/** 구간 내 빠진 달을 0으로 채우고 net(income-expense)을 파생 (PRD §3.10) */
export function fillTrendMonths(
  from: string,
  to: string,
  rows: readonly RawTrendRow[],
): TrendMonth[] {
  const byYm = new Map(rows.map((row) => [row.ym, row]))
  const [fromYear, fromMonth] = from.split("-").map(Number)
  const [toYear, toMonth] = to.split("-").map(Number)
  const monthCount = (toYear - fromYear) * 12 + (toMonth - fromMonth) + 1

  return Array.from({ length: Math.max(monthCount, 0) }, (_, index) => {
    const ym = ymString(fromYear, fromMonth - 1 + index)
    const source = byYm.get(ym)
    const income = source?.income ?? 0
    const expense = source?.expense ?? 0
    return {
      ym,
      income,
      expense,
      saving: source?.saving ?? 0,
      net: income - expense,
    }
  })
}

/** 'YYYY-MM' 구간 → SQL 날짜 경계 [start, endExclusive) */
export function monthRange(
  from: string,
  to: string,
): { start: string; endExclusive: string } {
  const [toYear, toMonth] = to.split("-").map(Number)
  return {
    start: `${from}-01`,
    endExclusive: `${ymString(toYear, toMonth)}-01`, // toMonth는 1-기반 → 0-기반 인덱스로 +1개월
  }
}
