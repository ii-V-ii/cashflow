"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiGet, apiPost, apiDelete } from "@/lib/api-client"
import type { TransactionFilter } from "@/types"

interface TransactionRow {
  id: string
  type: string
  amount: number
  description: string
  categoryId: string | null
  accountId: string
  toAccountId: string | null
  date: string
  memo: string | null
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

  return sp.toString()
}

export function useTransactions(params?: TransactionParams) {
  const qs = buildSearchParams(params)
  return useQuery({
    queryKey: ["transactions", qs],
    queryFn: async () => {
      const res = await fetch(`/api/transactions?${qs}`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error?.message ?? "거래 목록 로드 실패")
      return json as { success: true } & TransactionListResponse
    },
  })
}

export function useCreateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiPost<TransactionRow>("/api/transactions", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] })
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
      qc.invalidateQueries({ queryKey: ["transactions"] })
      qc.invalidateQueries({ queryKey: ["dashboard"] })
      qc.invalidateQueries({ queryKey: ["accounts"] })
    },
  })
}
