"use client"

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query"

import {
  createTransaction,
  deleteTransaction,
  updateTransaction,
} from "@/features/transactions/api"
import { ymOf } from "@/lib/format"
import {
  applyBalanceDeltas,
  balanceDeltas,
  insertMonthRow,
  makeOptimisticId,
  removeMonthRow,
  replaceMonthRow,
  type MonthCache,
} from "@/lib/optimistic/transactions"
import { qk } from "@/lib/query-keys"
import type {
  CreateTransactionInput,
  UpdateTransactionInput,
} from "@/lib/validators/transaction"
import { useToastStore } from "@/stores/toast-store"
import type { AccountDto, CategoryDto, TransactionDto } from "@/types/api"

type MonthPage = MonthCache<TransactionDto>

/**
 * 거래 뮤테이션 3종 — ARCHITECTURE.md §7 낙관적 업데이트 프로토콜 그대로.
 * 낙관적 delta 대상은 transactions.month(ym) + accounts.list 2개 캐시로 한정.
 * onSettled 무효화 키는 §6.3 표(광역 무효화 금지 — 해당 월만).
 */

function invalidateTransactionScope(queryClient: QueryClient, ym: string): void {
  void queryClient.invalidateQueries({ queryKey: qk.transactions.month(ym) })
  void queryClient.invalidateQueries({ queryKey: [...qk.transactions.all, "list"] })
  void queryClient.invalidateQueries({ queryKey: qk.accounts.list() })
  void queryClient.invalidateQueries({ queryKey: qk.dashboard.month(ym) })
  void queryClient.invalidateQueries({ queryKey: qk.settlements.monthly(ym) })
  void queryClient.invalidateQueries({ queryKey: qk.budgets.actuals(ym) })
}

async function snapshotAndCancel(queryClient: QueryClient, ym: string) {
  await Promise.all([
    queryClient.cancelQueries({ queryKey: qk.transactions.month(ym) }),
    queryClient.cancelQueries({ queryKey: qk.accounts.list() }),
  ])
  return {
    ym,
    month: queryClient.getQueryData<MonthPage>(qk.transactions.month(ym)),
    accounts: queryClient.getQueryData<AccountDto[]>(qk.accounts.list()),
  }
}

type Snapshot = Awaited<ReturnType<typeof snapshotAndCancel>>

function rollback(queryClient: QueryClient, snapshot: Snapshot | undefined): void {
  if (!snapshot) return
  queryClient.setQueryData(qk.transactions.month(snapshot.ym), snapshot.month)
  queryClient.setQueryData(qk.accounts.list(), snapshot.accounts)
}

function accountRef(accounts: AccountDto[] | undefined, id: string | null | undefined) {
  if (!id) return null
  const account = accounts?.find((item) => item.id === id)
  return account ? { id: account.id, name: account.name, type: account.type } : null
}

function buildOptimisticRow(
  input: CreateTransactionInput,
  accounts: AccountDto[] | undefined,
  categories: CategoryDto[] | undefined,
): TransactionDto {
  const category = input.categoryId
    ? (categories?.find((item) => item.id === input.categoryId) ?? null)
    : null
  const now = new Date().toISOString()
  return {
    id: makeOptimisticId(),
    type: input.type,
    amount: input.amount,
    description: input.description,
    date: input.date,
    categoryId: input.categoryId ?? null,
    category: category
      ? {
          id: category.id,
          name: category.name,
          icon: category.icon,
          color: category.color,
          expenseKind: category.expenseKind,
        }
      : null,
    accountId: input.accountId,
    account: accountRef(accounts, input.accountId) ?? {
      id: input.accountId,
      name: "…",
      type: "bank",
    },
    toAccountId: input.toAccountId ?? null,
    toAccount: accountRef(accounts, input.toAccountId),
    memo: input.memo ?? null,
    tags: [],
    installmentMonths: input.installmentMonths ?? null,
    installmentCurrent: input.installmentCurrent ?? null,
    status: "applied",
    recurringId: null,
    createdAt: now,
    updatedAt: now,
  }
}

export function useCreateTransaction() {
  const queryClient = useQueryClient()
  const showToast = useToastStore((state) => state.show)

  return useMutation({
    mutationFn: (input: CreateTransactionInput) => createTransaction(input),
    onMutate: async (input) => {
      const ym = ymOf(input.date)
      const snapshot = await snapshotAndCancel(queryClient, ym)

      const optimisticRow = buildOptimisticRow(
        input,
        snapshot.accounts,
        queryClient.getQueryData<CategoryDto[]>(qk.categories.list()),
      )
      queryClient.setQueryData<MonthPage | undefined>(
        qk.transactions.month(ym),
        (cache) => insertMonthRow(cache, optimisticRow),
      )
      queryClient.setQueryData<AccountDto[] | undefined>(qk.accounts.list(), (list) =>
        list ? applyBalanceDeltas(list, balanceDeltas(input), 1) : list,
      )
      return { ...snapshot, optimisticId: optimisticRow.id }
    },
    onError: (_error, _input, context) => {
      rollback(queryClient, context)
      showToast("저장에 실패했어요. 다시 시도해주세요.", "error")
    },
    onSuccess: (created, _input, context) => {
      // 임시 row를 서버 진실로 교체 (id 확정 → 수정/삭제 활성화)
      queryClient.setQueryData<MonthPage | undefined>(
        qk.transactions.month(context.ym),
        (cache) => replaceMonthRow(cache, context.optimisticId, created),
      )
    },
    onSettled: (_created, _error, input) => {
      invalidateTransactionScope(queryClient, ymOf(input.date))
    },
  })
}

export interface UpdateTransactionVariables {
  id: string
  input: UpdateTransactionInput
  previous: TransactionDto
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient()
  const showToast = useToastStore((state) => state.show)

  return useMutation({
    mutationFn: ({ id, input }: UpdateTransactionVariables) =>
      updateTransaction(id, input),
    onMutate: async ({ id, input, previous }) => {
      const oldYm = ymOf(previous.date)
      const newYm = ymOf(input.date ?? previous.date)
      const snapshot = await snapshotAndCancel(queryClient, oldYm)
      const newMonthSnapshot =
        newYm === oldYm
          ? undefined
          : queryClient.getQueryData<MonthPage>(qk.transactions.month(newYm))

      const merged: TransactionDto = {
        ...previous,
        type: input.type ?? previous.type,
        amount: input.amount ?? previous.amount,
        description: input.description ?? previous.description,
        date: input.date ?? previous.date,
        memo: input.memo === undefined ? previous.memo : input.memo,
        accountId: input.accountId ?? previous.accountId,
        toAccountId:
          input.toAccountId === undefined ? previous.toAccountId : input.toAccountId,
        categoryId:
          input.categoryId === undefined ? previous.categoryId : input.categoryId,
      }

      // 목록: 같은 월이면 치환, 월 이동이면 구 월에서 제거(신 월은 무효화가 담당 — §7)
      queryClient.setQueryData<MonthPage | undefined>(
        qk.transactions.month(oldYm),
        (cache) =>
          newYm === oldYm
            ? replaceMonthRow(cache, id, merged)
            : removeMonthRow(cache, id),
      )
      // 잔액: 이전 거래의 역(−)delta + 새 값의 delta 순차 적용 (§7 update)
      queryClient.setQueryData<AccountDto[] | undefined>(qk.accounts.list(), (list) => {
        if (!list) return list
        const reversed = applyBalanceDeltas(list, balanceDeltas(previous), -1)
        return applyBalanceDeltas(reversed, balanceDeltas(merged), 1)
      })

      return { ...snapshot, oldYm, newYm, newMonthSnapshot }
    },
    onError: (_error, _variables, context) => {
      rollback(queryClient, context)
      if (context && context.newYm !== context.oldYm) {
        queryClient.setQueryData(
          qk.transactions.month(context.newYm),
          context.newMonthSnapshot,
        )
      }
      showToast("수정에 실패했어요. 다시 시도해주세요.", "error")
    },
    onSettled: (_updated, _error, _variables, context) => {
      if (!context) return
      invalidateTransactionScope(queryClient, context.oldYm)
      if (context.newYm !== context.oldYm) {
        invalidateTransactionScope(queryClient, context.newYm)
      }
    },
  })
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient()
  const showToast = useToastStore((state) => state.show)

  return useMutation({
    mutationFn: (previous: TransactionDto) => deleteTransaction(previous.id),
    onMutate: async (previous) => {
      const ym = ymOf(previous.date)
      const snapshot = await snapshotAndCancel(queryClient, ym)

      queryClient.setQueryData<MonthPage | undefined>(
        qk.transactions.month(ym),
        (cache) => removeMonthRow(cache, previous.id),
      )
      queryClient.setQueryData<AccountDto[] | undefined>(qk.accounts.list(), (list) =>
        list ? applyBalanceDeltas(list, balanceDeltas(previous), -1) : list,
      )
      return snapshot
    },
    onError: (_error, _previous, context) => {
      rollback(queryClient, context)
      showToast("삭제에 실패했어요. 다시 시도해주세요.", "error")
    },
    onSettled: (_result, _error, previous) => {
      invalidateTransactionScope(queryClient, ymOf(previous.date))
    },
  })
}
