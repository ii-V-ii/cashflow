"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import {
  copyBudget,
  createBudget,
  deleteBudget,
  updateBudget,
  upsertAnnualGridCell,
} from "@/features/budgets/api"
import { qk } from "@/lib/query-keys"
import type {
  CopyBudgetInput,
  CreateBudgetInput,
  UpdateAnnualGridCellInput,
  UpdateBudgetInput,
} from "@/lib/validators/budget"
import { useToastStore } from "@/stores/toast-store"

/**
 * 예산 뮤테이션 — 예산 도메인은 데이터가 작아 낙관적 병합 대신
 * qk.budgets.all 무효화로 단순하게 유지한다 (목록·상세·실적·그리드·개요 전부 파생).
 */
export function useBudgetMutations() {
  const queryClient = useQueryClient()
  const showToast = useToastStore((state) => state.show)

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: qk.budgets.all })
  }
  const onError = (error: Error) => showToast(error.message, "error")

  const create = useMutation({
    mutationFn: (input: CreateBudgetInput) => createBudget(input),
    onSuccess: invalidate,
    onError,
  })
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateBudgetInput }) =>
      updateBudget(id, input),
    onSuccess: invalidate,
    onError,
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteBudget(id),
    onSuccess: invalidate,
    onError,
  })
  const copy = useMutation({
    mutationFn: (input: CopyBudgetInput) => copyBudget(input),
    onSuccess: invalidate,
    onError,
  })
  const upsertCell = useMutation({
    mutationFn: (input: UpdateAnnualGridCellInput) => upsertAnnualGridCell(input),
    onSuccess: invalidate,
    onError,
  })

  return { create, update, remove, copy, upsertCell }
}
