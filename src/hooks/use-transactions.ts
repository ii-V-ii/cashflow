"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api-client"
import type { TransactionFilter } from "@/types"
import type { CreateTransactionInput, UpdateTransactionInput } from "@/lib/validators/transaction"

export interface TransactionRow {
  id: string
  type: "income" | "expense" | "transfer"
  amount: number
  description: string
  status: "pending" | "applied"
  categoryId: string | null
  accountId: string
  toAccountId: string | null
  recurringId: string | null
  date: string
  memo: string | null
  installmentMonths: number | null
  installmentCurrent: number | null
  tags: string[]
  createdAt: string
  updatedAt: string
}

interface TransactionListResponse {
  data: TransactionRow[]
  meta: { total: number; page: number; limit: number; totalPages: number }
}

interface TransactionParams {
  filter?: TransactionFilter
  page?: number
  limit?: number
}

const TRANSACTIONS_KEY = ["transactions"] as const

function buildSearchParams(params?: TransactionParams): string {
  const sp = new URLSearchParams()
  if (!params) return sp.toString()

  if (params.page) sp.set("page", String(params.page))
  if (params.limit) sp.set("limit", String(params.limit))

  const f = params.filter
  if (f?.type) sp.set("type", f.type)
  if (f?.categoryId) sp.set("categoryId", f.categoryId)
  if (f?.accountId) sp.set("accountId", f.accountId)
  if (f?.dateRange?.from) sp.set("from", f.dateRange.from)
  if (f?.dateRange?.to) sp.set("to", f.dateRange.to)
  if (f?.search) sp.set("search", f.search)
  if (f?.tags && f.tags.length > 0) sp.set("tags", f.tags.join(","))

  return sp.toString()
}

export function useTransactions(params?: TransactionParams) {
  const qs = buildSearchParams(params)
  const f = params?.filter
  // Flat primitive key prevents unbounded cache growth from inline filter objects
  // that change identity on every render.
  const queryKey = [
    ...TRANSACTIONS_KEY,
    params?.page ?? 1,
    params?.limit ?? 20,
    f?.type ?? null,
    f?.categoryId ?? null,
    f?.accountId ?? null,
    f?.dateRange?.from ?? null,
    f?.dateRange?.to ?? null,
    f?.search ?? null,
    f?.tags ? [...f.tags].sort().join(",") : null,
    f?.minAmount ?? null,
    f?.maxAmount ?? null,
  ] as const

  return useQuery<TransactionListResponse>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/transactions?${qs}`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error?.message ?? "거래 목록 로드 실패")
      return { data: json.data, meta: json.meta }
    },
  })
}

export function useCreateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateTransactionInput) =>
      apiPost<TransactionRow>("/api/transactions", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TRANSACTIONS_KEY })
      qc.invalidateQueries({ queryKey: ["dashboard"] })
      qc.invalidateQueries({ queryKey: ["accounts"] })
    },
  })
}

export function useUpdateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTransactionInput }) =>
      apiPut<TransactionRow>(`/api/transactions/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TRANSACTIONS_KEY })
      qc.invalidateQueries({ queryKey: ["dashboard"] })
      qc.invalidateQueries({ queryKey: ["accounts"] })
    },
  })
}

export function useDeleteTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiDelete<{ deleted: true }>(`/api/transactions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TRANSACTIONS_KEY })
      qc.invalidateQueries({ queryKey: ["dashboard"] })
      qc.invalidateQueries({ queryKey: ["accounts"] })
    },
  })
}
