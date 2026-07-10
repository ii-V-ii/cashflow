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
