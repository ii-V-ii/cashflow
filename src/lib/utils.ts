import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format } from "date-fns"
import { nanoid } from "nanoid"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const numberFormatter = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 0,
})

/** Returns formatted currency without sign. Uses absolute value (use color for negative). */
export function formatCurrency(amount: number): string {
  const abs = Math.abs(amount)
  return numberFormatter.format(abs)
}

/** Returns formatted number only (no sign). Alias for formatCurrency. */
export function formatNumber(amount: number): string {
  return numberFormatter.format(Math.abs(amount))
}

export function formatDate(
  date: Date | string,
  pattern: string = "yyyy-MM-dd",
): string {
  const d = typeof date === "string" ? new Date(date) : date
  return format(d, pattern)
}

export function generateId(): string {
  return nanoid()
}

export function yearDateRange(year: number) {
  return { start: `${year}-01-01`, end: `${year + 1}-01-01` }
}

export function monthDateRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const end = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
  return { start, end }
}
