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

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const

/**
 * 'YYYY-MM-DD' → "7월 3일 (금)" — 거래 목록 일자 헤더(transaction-list.tsx)와
 * 홈 화면 선택 날짜 헤딩(home-screen.tsx)이 공용으로 쓰는 포맷 (MED-4: 중복 제거).
 */
export function formatDateHeading(date: string): string {
  const [, month, day] = date.split("-").map(Number)
  const weekday = WEEKDAY_LABELS[new Date(`${date}T00:00:00`).getDay()]
  return `${month}월 ${day}일 (${weekday})`
}
