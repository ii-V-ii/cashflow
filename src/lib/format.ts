const krwFormatter = new Intl.NumberFormat('ko-KR')

export function formatKRW(amount: number): string {
  return `₩${krwFormatter.format(amount)}`
}
