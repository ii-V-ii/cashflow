"use client"

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query"

import {
  createRecurring,
  deleteRecurring,
  processRecurring,
  updateRecurring,
} from "@/features/recurring/api"
import { qk } from "@/lib/query-keys"
import type {
  CreateRecurringInput,
  UpdateRecurringInput,
} from "@/lib/validators/recurring"
import { useToastStore } from "@/stores/toast-store"

/**
 * 정기 거래 뮤테이션 — 낙관적 업데이트 없음(빈도 낮음), 무효화만.
 * 규칙 변경은 12개월치 pending 거래를 재생성하므로 transactions 전역을 무효화한다.
 */
function invalidateRecurringScope(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: qk.recurring.all })
  void queryClient.invalidateQueries({ queryKey: qk.transactions.all })
}

export function useRecurringMutations() {
  const queryClient = useQueryClient()
  const showToast = useToastStore((state) => state.show)

  const invalidate = () => invalidateRecurringScope(queryClient)
  const onError = (error: Error) => showToast(error.message, "error")

  const create = useMutation({
    mutationFn: (input: CreateRecurringInput) => createRecurring(input),
    onSuccess: invalidate,
    onError,
  })

  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateRecurringInput }) =>
      updateRecurring(id, input),
    onSuccess: invalidate,
    onError,
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteRecurring(id),
    onSuccess: invalidate,
    onError,
  })

  /** 온디맨드 도래 처리 — applied 전환은 잔액·대시보드에도 반영된다 */
  const process = useMutation({
    mutationFn: processRecurring,
    onSuccess: () => {
      invalidate()
      void queryClient.invalidateQueries({ queryKey: qk.accounts.list() })
      void queryClient.invalidateQueries({ queryKey: qk.dashboard.all })
    },
    onError,
  })

  return { create, update, remove, process }
}
