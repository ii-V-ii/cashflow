"use client"

import { ArrowDownIcon, ArrowUpIcon, PlusIcon } from "lucide-react"
import { useState } from "react"

import { BottomSheet } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import {
  useAccountMutations,
  useAccounts,
  useReorderAccounts,
} from "@/features/accounts/hooks/use-accounts"
import { formatKrw } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useToastStore } from "@/stores/toast-store"
import type { AccountDto } from "@/types/api"

const ACCOUNT_TYPE_LABELS: Record<AccountDto["type"], string> = {
  cash: "현금",
  bank: "은행",
  card: "카드",
  savings: "적금",
  investment: "투자",
}

interface AccountFormState {
  name: string
  type: AccountDto["type"]
  balance: string
}

const EMPTY_FORM: AccountFormState = { name: "", type: "bank", balance: "0" }

/** 계좌 관리 — 기본 CRUD + 버튼식 상하 이동 정렬 (dnd는 후속) */
export function AccountsScreen() {
  const { data: accounts = [], isPending } = useAccounts()
  const { create, update, remove } = useAccountMutations()
  const reorder = useReorderAccounts()
  const showToast = useToastStore((state) => state.show)

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<AccountFormState>(EMPTY_FORM)
  const [deleting, setDeleting] = useState<AccountDto | null>(null)

  const totalBalance = accounts.reduce((sum, account) => sum + account.balance, 0)

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setEditorOpen(true)
  }

  function openEdit(account: AccountDto) {
    setEditingId(account.id)
    setForm({
      name: account.name,
      type: account.type,
      balance: String(account.initialBalance),
    })
    setEditorOpen(true)
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const balance = Number(form.balance.replace(/[^\d-]/g, "") || "0")
    if (editingId) {
      update.mutate(
        { id: editingId, input: { name: form.name, type: form.type, initialBalance: balance } },
        { onSuccess: () => showToast("계좌가 수정되었습니다") },
      )
    } else {
      create.mutate(
        { name: form.name, type: form.type, balance },
        { onSuccess: () => showToast("계좌가 추가되었습니다") },
      )
    }
    setEditorOpen(false)
  }

  function handleDelete() {
    if (!deleting) return
    remove.mutate(deleting.id, {
      onSuccess: () => showToast("계좌가 삭제되었습니다"),
    })
    setDeleting(null)
  }

  function move(index: number, delta: -1 | 1) {
    const target = index + delta
    if (target < 0 || target >= accounts.length) return
    const next = [...accounts]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    reorder.mutate(next.map((account, order) => ({ id: account.id, sortOrder: order })))
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pt-6">
      <header className="flex items-end justify-between px-1">
        <div>
          <h1 className="text-xs text-ink-muted">총 잔액</h1>
          <p className="amount text-[length:var(--text-amount-hero)] font-bold leading-tight text-ink" data-testid="total-balance">
            {formatKrw(totalBalance)}
          </p>
        </div>
        <Button onClick={openCreate} data-testid="add-account" className="h-11 bg-ink px-4 text-surface-raised hover:bg-ink/90">
          <PlusIcon className="size-4" /> 계좌 추가
        </Button>
      </header>

      {isPending ? (
        <div className="flex flex-col gap-2" aria-hidden>
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-16 animate-pulse rounded-xl bg-surface-sunken" />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <p className="text-sm text-ink-muted">아직 계좌가 없습니다</p>
          <Button onClick={openCreate} className="h-11 bg-ink text-surface-raised">
            첫 계좌 만들기
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-hairline rounded-xl bg-surface-raised ring-1 ring-hairline">
          {accounts.map((account, index) => (
            <li key={account.id} className="flex items-center gap-2 px-3 py-[var(--space-row)]" data-testid="account-row">
              <button
                type="button"
                onClick={() => openEdit(account)}
                className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
              >
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium text-ink">{account.name}</span>
                  <span className="rounded-md bg-surface-sunken px-1.5 py-0.5 text-[11px] text-ink-muted">
                    {ACCOUNT_TYPE_LABELS[account.type]}
                  </span>
                </span>
                <span
                  className={cn(
                    "amount text-[length:var(--text-amount-md)] font-semibold",
                    account.balance < 0 ? "text-loss" : "text-ink",
                  )}
                  data-testid={`account-balance-${account.name}`}
                >
                  {formatKrw(account.balance)}
                </span>
              </button>
              <div className="flex flex-col">
                <button
                  type="button"
                  aria-label={`${account.name} 위로 이동`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  className="flex size-11 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-sunken disabled:opacity-30"
                >
                  <ArrowUpIcon className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={`${account.name} 아래로 이동`}
                  disabled={index === accounts.length - 1}
                  onClick={() => move(index, 1)}
                  className="flex size-11 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-sunken disabled:opacity-30"
                >
                  <ArrowDownIcon className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <BottomSheet
        open={editorOpen}
        onOpenChange={setEditorOpen}
        title={editingId ? "계좌 수정" : "계좌 추가"}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
            이름
            <Input
              required
              value={form.name}
              data-testid="account-name-input"
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              className="h-11"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
            유형
            <select
              value={form.type}
              onChange={(event) =>
                setForm({ ...form, type: event.target.value as AccountDto["type"] })
              }
              className="h-11 rounded-lg border border-hairline bg-surface-raised px-3 text-sm text-ink"
            >
              {Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
            {editingId ? "초기 잔액 (잔액 보정)" : "시작 잔액"}
            <Input
              inputMode="numeric"
              value={form.balance}
              data-testid="account-balance-input"
              onChange={(event) =>
                setForm({ ...form, balance: event.target.value.replace(/[^\d-]/g, "") })
              }
              className="amount h-11 text-right"
            />
          </label>
          <div className="flex gap-2">
            {editingId && (
              <Button
                type="button"
                variant="destructive"
                className="h-12 flex-1"
                onClick={() => {
                  const account = accounts.find((item) => item.id === editingId)
                  if (account) setDeleting(account)
                  setEditorOpen(false)
                }}
              >
                삭제
              </Button>
            )}
            <Button
              type="submit"
              data-testid="save-account"
              className="h-12 flex-[2] bg-ink text-surface-raised hover:bg-ink/90"
              disabled={create.isPending || update.isPending}
            >
              저장
            </Button>
          </div>
        </form>
      </BottomSheet>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="계좌를 삭제할까요?"
        description={
          deleting
            ? `'${deleting.name}' 계좌를 삭제합니다. 거래가 남아 있으면 삭제할 수 없습니다.`
            : ""
        }
        onConfirm={handleDelete}
        isPending={remove.isPending}
      />
    </main>
  )
}
