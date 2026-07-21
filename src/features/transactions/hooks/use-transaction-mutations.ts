"use client"

import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query"

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
 * 낙관적 delta 대상은 transactions.month(ym) 프리픽스로 캐시된 모든
 * monthPage(ym, page) + accounts.list 캐시로 한정 (101건+ 월에서도 페이지 절단 없이 반영).
 * onSettled 무효화 키는 §6.3 표(광역 무효화 금지 — 해당 월만).
 */

function invalidateTransactionScope(queryClient: QueryClient, ym: string): void {
  void queryClient.invalidateQueries({ queryKey: qk.transactions.month(ym) })
  void queryClient.invalidateQueries({ queryKey: [...qk.transactions.all, "list"] })
  void queryClient.invalidateQueries({ queryKey: qk.accounts.list() })
  void queryClient.invalidateQueries({ queryKey: qk.dashboard.month(ym) })
  void queryClient.invalidateQueries({ queryKey: qk.settlements.monthly(ym) })
  void queryClient.invalidateQueries({ queryKey: qk.budgets.actuals(ym) })
  // 연간 개요 차트(실적 축)도 거래 변경에 종속 (리뷰 MEDIUM)
  void queryClient.invalidateQueries({
    queryKey: qk.budgets.summary(Number(ym.slice(0, 4))),
  })
}

/**
 * 월(ym) 프리픽스로 캐시된 모든 monthPage(ym, page) 항목을 수집한다.
 * qk.transactions.month(ym)은 monthPage(ym, page)의 3-세그먼트 프리픽스이므로
 * getQueriesData의 프리픽스 매칭으로 캐시된 모든 page를 한 번에 얻는다.
 */
async function snapshotAndCancel(queryClient: QueryClient, ym: string) {
  await Promise.all([
    queryClient.cancelQueries({ queryKey: qk.transactions.month(ym) }),
    queryClient.cancelQueries({ queryKey: qk.accounts.list() }),
  ])
  return {
    ym,
    monthPages: queryClient.getQueriesData<MonthPage>({
      queryKey: qk.transactions.month(ym),
    }),
    accounts: queryClient.getQueryData<AccountDto[]>(qk.accounts.list()),
  }
}

type Snapshot = Awaited<ReturnType<typeof snapshotAndCancel>>
type MonthPageEntries = [QueryKey, MonthPage | undefined][]

/** 스냅샷에 담긴 여러 monthPage 캐시를 그대로 복원한다 (rollback 계열 공통 — LOW-6) */
function restoreMonthPages(queryClient: QueryClient, pages: MonthPageEntries): void {
  for (const [key, data] of pages) {
    queryClient.setQueryData(key, data)
  }
}

/** 캐시된 여러 monthPage 각각에 동일한 순수 함수 updater를 적용한다 (다중 page 낙관적 업데이트 공통 — LOW-6) */
function applyToMonthPages(
  queryClient: QueryClient,
  pages: MonthPageEntries,
  updater: (cache: MonthPage | undefined) => MonthPage | undefined,
): void {
  for (const [key] of pages) {
    queryClient.setQueryData<MonthPage | undefined>(key, updater)
  }
}

function rollback(queryClient: QueryClient, snapshot: Snapshot | undefined): void {
  if (!snapshot) return
  restoreMonthPages(queryClient, snapshot.monthPages)
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
      // 낙관적 삽입은 1페이지에만 적용한다 — 오늘 날짜는 date DESC 정렬에서 항상
      // 1페이지 상단에 위치한다. 1페이지가 캐시에 없으면 insertMonthRow가 undefined를
      // 반환해 setQueryData가 no-op으로 넘어간다 (크래시 없음).
      // 트레이드오프(의도됨): 1페이지가 이미 limit(20)건 가득 찬 상태였다면 낙관적
      // 삽입 직후 잠깐 21건이 보이고 그 page의 total도 실제와 어긋난다. insertMonthRow는
      // 순수 함수 계약(항상 삽입)을 지키므로 여기서 limit 초과분을 자르는 clamp를 하지
      // 않는다 — onSettled의 invalidateTransactionScope가 곧바로 재조회해 정확한
      // 페이지 경계로 자가 치유(self-heal)한다.
      queryClient.setQueryData<MonthPage | undefined>(
        qk.transactions.monthPage(ym, 1),
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
        qk.transactions.monthPage(context.ym, 1),
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
      // 신 월(newYm)은 onMutate에서 직접 쓰지 않지만(§7 — 신 월은 무효화가 담당), 롤백
      // 대상으로 스냅샷을 뜬다. cancelQueries 없이 뜨면 스냅샷 직후 도착하는 백그라운드
      // refetch(신선한 서버 데이터)를 onError 롤백이 다시 스테일 값으로 덮어쓸 수 있다.
      let newMonthPages: MonthPageEntries | undefined
      if (newYm !== oldYm) {
        await queryClient.cancelQueries({ queryKey: qk.transactions.month(newYm) })
        newMonthPages = queryClient.getQueriesData<MonthPage>({
          queryKey: qk.transactions.month(newYm),
        })
      }

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

      // 목록: 같은 월이면 캐시된 모든 page에서 치환, 월 이동이면 구 월 모든 page에서
      // 제거한다(신 월은 무효화가 담당 — §7). id가 없는 page는 순수 함수가 no-op 처리.
      applyToMonthPages(queryClient, snapshot.monthPages, (cache) =>
        newYm === oldYm ? replaceMonthRow(cache, id, merged) : removeMonthRow(cache, id),
      )
      // 잔액: 이전 거래의 역(−)delta + 새 값의 delta 순차 적용 (§7 update)
      queryClient.setQueryData<AccountDto[] | undefined>(qk.accounts.list(), (list) => {
        if (!list) return list
        const reversed = applyBalanceDeltas(list, balanceDeltas(previous), -1)
        return applyBalanceDeltas(reversed, balanceDeltas(merged), 1)
      })

      return { ...snapshot, oldYm, newYm, newMonthPages }
    },
    onError: (_error, _variables, context) => {
      rollback(queryClient, context)
      if (context && context.newYm !== context.oldYm && context.newMonthPages) {
        restoreMonthPages(queryClient, context.newMonthPages)
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

      applyToMonthPages(queryClient, snapshot.monthPages, (cache) =>
        removeMonthRow(cache, previous.id),
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
