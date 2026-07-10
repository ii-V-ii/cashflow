import { apiFetch } from "@/lib/api/http"
import type {
  CreateTransactionInput,
  UpdateTransactionInput,
} from "@/lib/validators/transaction"
import type { PageDto, TransactionDto } from "@/types/api"

export interface TransactionListFilter {
  type?: "income" | "expense" | "transfer"
  categoryId?: string
  accountId?: string
  search?: string
  tags?: string[]
  from?: string
  to?: string
}

function toSearchParams(
  filter: TransactionListFilter,
  page: number,
  limit: number,
): string {
  const params = new URLSearchParams()
  if (filter.type) params.set("type", filter.type)
  if (filter.categoryId) params.set("categoryId", filter.categoryId)
  if (filter.accountId) params.set("accountId", filter.accountId)
  if (filter.search) params.set("search", filter.search)
  if (filter.tags && filter.tags.length > 0) params.set("tags", filter.tags.join(","))
  if (filter.from) params.set("from", filter.from)
  if (filter.to) params.set("to", filter.to)
  params.set("page", String(page))
  params.set("limit", String(limit))
  return params.toString()
}

export function getTransactions(
  filter: TransactionListFilter,
  page: number,
  limit: number,
): Promise<PageDto<TransactionDto>> {
  return apiFetch(`/api/v1/transactions?${toSearchParams(filter, page, limit)}`)
}

/** 월 원장 — ym('YYYY-MM') 전체를 1페이지로 (transactions.month 캐시 대상) */
export function getTransactionsMonth(ym: string): Promise<PageDto<TransactionDto>> {
  const [year, month] = ym.split("-").map(Number)
  const lastDay = new Date(year, month, 0).getDate()
  return getTransactions(
    { from: `${ym}-01`, to: `${ym}-${String(lastDay).padStart(2, "0")}` },
    1,
    100,
  )
}

export function createTransaction(
  input: CreateTransactionInput,
): Promise<TransactionDto> {
  return apiFetch("/api/v1/transactions", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function updateTransaction(
  id: string,
  input: UpdateTransactionInput,
): Promise<TransactionDto> {
  return apiFetch(`/api/v1/transactions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  })
}

export function deleteTransaction(id: string): Promise<{ id: string }> {
  return apiFetch(`/api/v1/transactions/${id}`, { method: "DELETE" })
}
