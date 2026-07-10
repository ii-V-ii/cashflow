"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  createAccount,
  deleteAccount,
  getAccounts,
  reorderAccounts,
  updateAccount,
} from "@/features/accounts/api"
import { qk } from "@/lib/query-keys"
import type { CreateAccountInput, UpdateAccountInput } from "@/lib/validators/account"
import { useToastStore } from "@/stores/toast-store"
import type { AccountDto } from "@/types/api"

const ACCOUNTS_STALE_TIME_MS = 30_000

export function useAccounts() {
  return useQuery({
    queryKey: qk.accounts.list(),
    queryFn: getAccounts,
    staleTime: ACCOUNTS_STALE_TIME_MS,
  })
}

/** 계좌 CUD — 낙관적 없음, accounts.list 무효화만 (ARCHITECTURE.md §6.3) */
export function useAccountMutations() {
  const queryClient = useQueryClient()
  const showToast = useToastStore((state) => state.show)

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: qk.accounts.list() })
    void queryClient.invalidateQueries({ queryKey: qk.dashboard.all })
  }
  const onError = (error: Error) => showToast(error.message, "error")

  const create = useMutation({
    mutationFn: (input: CreateAccountInput) => createAccount(input),
    onSuccess: invalidate,
    onError,
  })
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAccountInput }) =>
      updateAccount(id, input),
    onSuccess: invalidate,
    onError,
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteAccount(id),
    onSuccess: invalidate,
    onError,
  })

  return { create, update, remove }
}

/** 정렬: accounts.list 배열 재정렬 낙관적 반영 (ARCHITECTURE.md §6.3 계좌 order) */
export function useReorderAccounts() {
  const queryClient = useQueryClient()
  const showToast = useToastStore((state) => state.show)

  return useMutation({
    mutationFn: (items: { id: string; sortOrder: number }[]) => reorderAccounts(items),
    onMutate: async (items) => {
      await queryClient.cancelQueries({ queryKey: qk.accounts.list() })
      const previous = queryClient.getQueryData<AccountDto[]>(qk.accounts.list())
      queryClient.setQueryData<AccountDto[] | undefined>(qk.accounts.list(), (list) => {
        if (!list) return list
        const orderMap = new Map(items.map((item) => [item.id, item.sortOrder]))
        return list
          .map((account) => ({
            ...account,
            sortOrder: orderMap.get(account.id) ?? account.sortOrder,
          }))
          .sort((a, b) => a.sortOrder - b.sortOrder)
      })
      return { previous }
    },
    onError: (_error, _items, context) => {
      queryClient.setQueryData(qk.accounts.list(), context?.previous)
      showToast("정렬 저장에 실패했어요", "error")
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.accounts.list() })
    },
  })
}
