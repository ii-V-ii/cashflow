/** 금액·날짜 표시 유틸 — KRW는 정수, Intl.NumberFormat('ko-KR') (CLAUDE.md 통화 처리) */

const krwFormatter = new Intl.NumberFormat("ko-KR")

export function formatKrw(amount: number): string {
  return `${krwFormatter.format(amount)}원`
}

export function formatSignedKrw(amount: number): string {
  const formatted = formatKrw(amount)
  return amount > 0 ? `+${formatted}` : formatted
}

/** 'YYYY-MM-DD' → 'YYYY-MM' (월 단위 캐시 키 입자 — ARCHITECTURE.md §6.1) */
export function ymOf(date: string): string {
  return date.slice(0, 7)
}
