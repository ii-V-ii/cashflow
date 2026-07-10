/**
 * 거래 낙관적 업데이트 순수 함수 (ARCHITECTURE.md §7).
 * 적용 대상 캐시는 transactions.month(ym)와 accounts.list 2개로 한정한다.
 * 전부 불변 — 새 객체를 반환하고 입력을 변경하지 않는다.
 */

export interface BalanceDelta {
  accountId: string
  delta: number
}

export interface TransactionEffect {
  type: "income" | "expense" | "transfer"
  amount: number
  accountId: string
  toAccountId?: string | null
}

/**
 * 잔액 delta 표 (ARCHITECTURE.md §7):
 * income +amount · expense −amount · 저축(expense+to)/transfer는 −/+ 쌍.
 */
export function balanceDeltas(tx: TransactionEffect): BalanceDelta[] {
  if (tx.type === "income") {
    return [{ accountId: tx.accountId, delta: tx.amount }]
  }
  const deltas: BalanceDelta[] = [{ accountId: tx.accountId, delta: -tx.amount }]
  if (tx.toAccountId) {
    deltas.push({ accountId: tx.toAccountId, delta: tx.amount })
  }
  return deltas
}

export function applyBalanceDeltas<T extends { id: string; balance: number }>(
  accounts: readonly T[],
  deltas: readonly BalanceDelta[],
  sign: 1 | -1,
): T[] {
  return accounts.map((account) => {
    const applied = deltas
      .filter((delta) => delta.accountId === account.id)
      .reduce((sum, delta) => sum + delta.delta * sign, 0)
    return applied === 0 ? account : { ...account, balance: account.balance + applied }
  })
}

export interface MonthCache<T> {
  items: T[]
  total: number
  page: number
  limit: number
}

interface DatedRow {
  id: string
  date: string
}

/** date DESC 정렬 위치에 삽입 (§7 create — 목록 맨 앞이 아닌 date 기준 위치) */
export function insertMonthRow<T extends DatedRow>(
  cache: MonthCache<T> | undefined,
  row: T,
): MonthCache<T> | undefined {
  if (!cache) return cache
  const index = cache.items.findIndex((item) => item.date <= row.date)
  const at = index === -1 ? cache.items.length : index
  return {
    ...cache,
    items: [...cache.items.slice(0, at), row, ...cache.items.slice(at)],
    total: cache.total + 1,
  }
}

export function replaceMonthRow<T extends DatedRow>(
  cache: MonthCache<T> | undefined,
  id: string,
  row: T,
): MonthCache<T> | undefined {
  if (!cache) return cache
  return {
    ...cache,
    items: cache.items.map((item) => (item.id === id ? row : item)),
  }
}

export function removeMonthRow<T extends DatedRow>(
  cache: MonthCache<T> | undefined,
  id: string,
): MonthCache<T> | undefined {
  if (!cache) return cache
  const items = cache.items.filter((item) => item.id !== id)
  return {
    ...cache,
    items,
    total: cache.total - (cache.items.length - items.length),
  }
}

const OPTIMISTIC_PREFIX = "optimistic-"

export function makeOptimisticId(): string {
  return `${OPTIMISTIC_PREFIX}${crypto.randomUUID()}`
}

export function isOptimisticId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_PREFIX)
}
