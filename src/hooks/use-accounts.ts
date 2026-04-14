"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { Account } from "@/types"
import type { CreateAccountInput, UpdateAccountInput } from "@/lib/validators/account"
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api-client"

const ACCOUNTS_KEY = ["accounts"] as const

export function useAccounts() {
  return useQuery({
    queryKey: ACCOUNTS_KEY,
    queryFn: () => apiGet<Account[]>("/api/accounts"),
  })
}

export function useCreateAccount() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateAccountInput) =>
      apiPost<Account>("/api/accounts", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY })
    },
  })
}

export function useUpdateAccount() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAccountInput }) =>
      apiPut<Account>(`/api/accounts/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY })
    },
  })
}

export function useDeleteAccount() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      apiDelete<{ deleted: boolean }>(`/api/accounts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY })
    },
  })
}

type ReorderItem = { id: string; sortOrder: number }

export function useReorderAccounts() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (items: ReorderItem[]) =>
      apiPost<{ updated: number }>("/api/accounts/reorder", { items }),
    onMutate: async (items: ReorderItem[]) => {
      await queryClient.cancelQueries({ queryKey: ACCOUNTS_KEY })
      const previous = queryClient.getQueryData<Account[]>(ACCOUNTS_KEY)

      if (previous) {
        const orderMap = new Map(items.map((i) => [i.id, i.sortOrder]))
        const next = previous.map((a) => ({
          ...a,
          sortOrder: orderMap.get(a.id) ?? a.sortOrder,
        }))
        next.sort((a, b) => a.sortOrder - b.sortOrder)
        queryClient.setQueryData(ACCOUNTS_KEY, next)
      }

      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(ACCOUNTS_KEY, context.previous)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY, exact: true })
    },
  })
}
