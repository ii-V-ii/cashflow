import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format } from "date-fns"
import { nanoid } from "nanoid"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const currencyFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
})

export function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount)
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
