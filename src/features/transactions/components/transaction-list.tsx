"use client"

import { formatKrw, formatSignedKrw } from "@/lib/format"
import { isOptimisticId } from "@/lib/optimistic/transactions"
import { cn } from "@/lib/utils"
import {
  TypeBadge,
  amountClass,
} from "@/features/transactions/components/type-badge"
import type { TransactionDto } from "@/types/api"

function signedAmount(transaction: TransactionDto): number {
  return transaction.type === "income" ? transaction.amount : -transaction.amount
}

interface DayGroup {
  date: string
  items: TransactionDto[]
  income: number
  expense: number
}

function groupByDate(items: TransactionDto[]): DayGroup[] {
  const groups = new Map<string, DayGroup>()
  for (const item of items) {
    const group = groups.get(item.date) ?? {
      date: item.date,
      items: [],
      income: 0,
      expense: 0,
    }
    group.items.push(item)
    if (item.type === "income") group.income += item.amount
    if (item.type === "expense") group.expense += item.amount
    groups.set(item.date, group)
  }
  return [...groups.values()]
}

function formatDateHeading(date: string): string {
  const [, month, day] = date.split("-").map(Number)
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][
    new Date(`${date}T00:00:00`).getDay()
  ]
  return `${month}월 ${day}일 (${weekday})`
}

/**
 * 모바일 원장: 2줄 리스트 행 + 일자 그룹 헤더(일 합계) — <Table> 금지 (UI.md §3.2, §5 거래)
 */
export function TransactionList({
  items,
  onSelect,
}: {
  items: TransactionDto[]
  onSelect: (transaction: TransactionDto) => void
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <p className="text-sm text-ink-muted">이 달의 거래가 없습니다</p>
        <p className="text-xs text-ink-muted">
          하단 ＋ 버튼으로 첫 거래를 기록해보세요
        </p>
      </div>
    )
  }

  return (
    <div data-testid="transaction-list">
      {groupByDate(items).map((group) => (
        <section key={group.date} aria-label={formatDateHeading(group.date)}>
          <header className="sticky top-0 z-10 flex items-baseline justify-between bg-surface px-1 pt-4 pb-1.5">
            <h3 className="text-xs font-semibold text-ink-muted">
              {formatDateHeading(group.date)}
            </h3>
            <p className="amount text-[11px] text-ink-muted">
              {group.income > 0 && (
                <span className="text-income-fg">+{formatKrw(group.income)} </span>
              )}
              {group.expense > 0 && (
                <span className="text-expense-fg">−{formatKrw(group.expense)}</span>
              )}
            </p>
          </header>
          <ul className="divide-y divide-hairline rounded-xl bg-surface-raised ring-1 ring-hairline">
            {group.items.map((transaction) => {
              const pendingOptimistic = isOptimisticId(transaction.id)
              return (
                <li key={transaction.id}>
                  <button
                    type="button"
                    disabled={pendingOptimistic}
                    onClick={() => onSelect(transaction)}
                    data-testid="transaction-row"
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-3 py-[var(--space-row)] text-left transition-colors hover:bg-surface-sunken/50",
                      pendingOptimistic && "animate-pulse opacity-70",
                    )}
                  >
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="truncate text-sm font-medium text-ink">
                        {transaction.description}
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-ink-muted">
                        <TypeBadge transaction={transaction} />
                        <span className="truncate">
                          {transaction.account.name}
                          {transaction.toAccount ? ` → ${transaction.toAccount.name}` : ""}
                          {transaction.tags.length > 0 &&
                            ` · ${transaction.tags.map((tag) => `#${tag.name}`).join(" ")}`}
                        </span>
                      </span>
                    </span>
                    <span
                      className={cn(
                        "amount shrink-0 text-[length:var(--text-amount-sm)] font-semibold",
                        amountClass(transaction),
                      )}
                    >
                      {formatSignedKrw(signedAmount(transaction))}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
