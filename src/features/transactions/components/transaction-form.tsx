"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { ChevronDownIcon } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useForm } from "react-hook-form"

import { useAccounts } from "@/features/accounts/hooks/use-accounts"
import { useCategories } from "@/features/categories/hooks/use-categories"
import { formatKrw } from "@/lib/format"
import {
  createTransactionSchema,
  type CreateTransactionInput,
} from "@/lib/validators/transaction"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { TransactionDto } from "@/types/api"

const TYPE_OPTIONS = [
  { value: "expense", label: "지출", activeClass: "bg-expense-subtle text-expense-fg" },
  { value: "income", label: "수입", activeClass: "bg-income-subtle text-income-fg" },
  { value: "transfer", label: "이체", activeClass: "bg-transfer-subtle text-transfer-fg" },
] as const

const TYPE_FALLBACK_LABEL: Record<string, string> = {
  expense: "지출",
  income: "수입",
  transfer: "이체",
}

function todayString(offsetDays = 0): string {
  const date = new Date()
  date.setDate(date.getDate() - offsetDays)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export interface TransactionFormProps {
  initial?: TransactionDto
  defaultType?: "income" | "expense" | "transfer"
  defaultAccountId?: string | null
  isPending: boolean
  submitLabel: string
  onSubmit: (input: CreateTransactionInput) => void
}

/**
 * 거래 입력 폼 (UI.md §4.2) — 금액 자동 포커스 → 카테고리 칩 → 저장 2~3탭 흐름.
 * 저축 카테고리 선택 시 입금 계좌가 같은 폼 안에서 확장된다 (PRD §5 규칙 1).
 */
export function TransactionForm({
  initial,
  defaultType = "expense",
  defaultAccountId,
  isPending,
  submitLabel,
  onSubmit,
}: TransactionFormProps) {
  const { data: accounts = [] } = useAccounts()
  const [showMore, setShowMore] = useState(Boolean(initial?.memo || initial?.tags.length))
  const amountRef = useRef<HTMLInputElement>(null)

  const form = useForm<CreateTransactionInput>({
    resolver: zodResolver(createTransactionSchema),
    defaultValues: initial
      ? {
          type: initial.type,
          amount: initial.amount,
          description: initial.description,
          categoryId: initial.categoryId,
          accountId: initial.accountId,
          toAccountId: initial.toAccountId,
          date: initial.date,
          memo: initial.memo ?? undefined,
          tags: initial.tags.map((tag) => tag.name),
          installmentMonths: initial.installmentMonths,
          installmentCurrent: initial.installmentCurrent,
        }
      : {
          type: defaultType,
          amount: undefined,
          description: "",
          categoryId: null,
          accountId: defaultAccountId ?? accounts[0]?.id ?? "",
          toAccountId: null,
          date: todayString(),
          tags: [],
        },
  })

  const type = form.watch("type")
  const categoryId = form.watch("categoryId")
  const date = form.watch("date")
  const amount = form.watch("amount")

  const { data: categories = [] } = useCategories(
    type === "transfer" ? undefined : type,
  )
  const categoryChips = useMemo(
    () => (type === "transfer" ? [] : categories),
    [categories, type],
  )
  const selectedCategory = categories.find((category) => category.id === categoryId)
  const isSaving = type === "expense" && selectedCategory?.expenseKind === "saving"
  const needsToAccount = type === "transfer" || isSaving

  // 계좌 목록이 늦게 도착했을 때 기본 계좌 채움
  useEffect(() => {
    if (!form.getValues("accountId") && accounts.length > 0) {
      form.setValue("accountId", defaultAccountId ?? accounts[0].id)
    }
  }, [accounts, defaultAccountId, form])

  useEffect(() => {
    amountRef.current?.focus()
  }, [])

  const amountRegister = form.register("amount", {
    setValueAs: (value) => {
      const digits = String(value).replace(/[^\d]/g, "")
      return digits === "" ? undefined : Number(digits)
    },
  })

  function submit(input: CreateTransactionInput) {
    onSubmit({
      ...input,
      toAccountId: needsToAccount ? input.toAccountId : null,
      tags: (input.tags ?? []).filter((tag) => tag.trim() !== ""),
    })
  }

  /** 내용이 비면 카테고리명/유형명으로 채운 뒤 검증 — 빠른 입력 2~3탭 흐름 보장 */
  function handleFormSubmit(event: React.FormEvent<HTMLFormElement>) {
    const description = form.getValues("description")
    if (!description || description.trim() === "") {
      form.setValue(
        "description",
        selectedCategory?.name ?? TYPE_FALLBACK_LABEL[form.getValues("type")],
      )
    }
    void form.handleSubmit(submit)(event)
  }

  const errors = form.formState.errors
  const firstError = Object.values(errors)[0]?.message

  return (
    <form
      onSubmit={handleFormSubmit}
      className="flex flex-col gap-4"
      data-testid="transaction-form"
    >
      {/* ① 유형 세그먼트 (지출 기본) */}
      <div role="radiogroup" aria-label="거래 유형" className="grid grid-cols-3 gap-1 rounded-xl bg-surface-sunken p-1">
        {TYPE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={type === option.value}
            onClick={() => {
              form.setValue("type", option.value)
              form.setValue("categoryId", null)
              if (option.value !== "transfer") form.setValue("toAccountId", null)
            }}
            className={cn(
              "h-11 rounded-lg text-sm font-medium text-ink-muted transition-colors",
              type === option.value && option.activeClass,
              type === option.value && "shadow-sm",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* ② 금액 — 자동 포커스, 큰 tabular 숫자 */}
      <div className="flex items-baseline gap-2">
        <Input
          {...amountRegister}
          ref={(element) => {
            amountRegister.ref(element)
            amountRef.current = element
          }}
          inputMode="numeric"
          autoComplete="off"
          placeholder="0"
          aria-label="금액"
          data-testid="amount-input"
          defaultValue={initial ? String(initial.amount) : ""}
          className="amount h-14 border-0 border-b-2 border-hairline bg-transparent px-1 text-right text-amount-hero font-semibold text-ink focus-visible:ring-0 rounded-none"
        />
        <span className="shrink-0 text-lg text-ink-muted">원</span>
      </div>
      {typeof amount === "number" && amount > 0 && (
        <p className="amount -mt-3 text-right text-xs text-ink-muted">
          {formatKrw(amount)}
        </p>
      )}

      {/* ③ 카테고리 칩 한 줄 (1탭 선택) */}
      {categoryChips.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1" role="listbox" aria-label="카테고리">
          {categoryChips.map((category) => (
            <button
              key={category.id}
              type="button"
              role="option"
              aria-selected={categoryId === category.id}
              onClick={() =>
                form.setValue("categoryId", categoryId === category.id ? null : category.id)
              }
              data-testid={`category-chip-${category.name}`}
              className={cn(
                "h-11 shrink-0 rounded-full border border-hairline px-4 text-sm font-medium text-ink-muted transition-colors",
                categoryId === category.id &&
                  (category.expenseKind === "saving"
                    ? "border-saving bg-saving-subtle text-saving-fg"
                    : type === "income"
                      ? "border-income bg-income-subtle text-income-fg"
                      : "border-expense bg-expense-subtle text-expense-fg"),
              )}
            >
              {category.name}
            </button>
          ))}
        </div>
      )}

      {/* ④ 계좌 (최근 사용 기본값) */}
      <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
        {type === "income" ? "입금 계좌" : "출금 계좌"}
        <select
          {...form.register("accountId")}
          data-testid="account-select"
          className="h-11 rounded-lg border border-hairline bg-surface-raised px-3 text-sm text-ink"
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </label>

      {/* 저축/이체 → 입금 계좌 확장 */}
      {needsToAccount && (
        <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
          {isSaving ? "저축 입금 계좌" : "이체 입금 계좌"}
          <select
            {...form.register("toAccountId", {
              setValueAs: (value) => (value === "" ? null : value),
            })}
            data-testid="to-account-select"
            className="h-11 rounded-lg border border-hairline bg-surface-raised px-3 text-sm text-ink"
          >
            <option value="">선택하세요</option>
            {accounts
              .filter((account) => account.id !== form.getValues("accountId"))
              .map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
          </select>
        </label>
      )}

      {/* ⑤ 날짜 (오늘 기본 + 퀵 칩) */}
      <div className="flex items-center gap-1.5">
        {[
          { label: "오늘", value: todayString() },
          { label: "어제", value: todayString(1) },
          { label: "그제", value: todayString(2) },
        ].map((chip) => (
          <button
            key={chip.label}
            type="button"
            onClick={() => form.setValue("date", chip.value)}
            className={cn(
              "h-11 rounded-full border border-hairline px-4 text-sm text-ink-muted",
              date === chip.value && "border-ink bg-surface-sunken font-medium text-ink",
            )}
          >
            {chip.label}
          </button>
        ))}
        <Input
          type="date"
          {...form.register("date")}
          aria-label="날짜"
          className="h-11 flex-1"
        />
      </div>

      {/* ⑥ 더 입력 (접힘) */}
      <button
        type="button"
        onClick={() => setShowMore((value) => !value)}
        className="flex h-11 items-center justify-center gap-1 text-sm text-ink-muted"
        aria-expanded={showMore}
      >
        더 입력 (내용·메모·태그·할부)
        <ChevronDownIcon className={cn("size-4 transition-transform", showMore && "rotate-180")} />
      </button>

      {showMore && (
        <div className="flex flex-col gap-3">
          <Input
            {...form.register("description")}
            placeholder="내용 (비우면 카테고리명)"
            aria-label="내용"
            data-testid="description-input"
            className="h-11"
          />
          <Input
            {...form.register("memo", {
              setValueAs: (value) => (value === "" ? null : value),
            })}
            placeholder="메모"
            aria-label="메모"
            className="h-11"
          />
          <Input
            aria-label="태그 (쉼표 구분)"
            placeholder="태그 (쉼표 구분)"
            defaultValue={initial?.tags.map((tag) => tag.name).join(", ") ?? ""}
            onChange={(event) =>
              form.setValue(
                "tags",
                event.target.value
                  .split(",")
                  .map((tag) => tag.trim())
                  .filter((tag) => tag !== ""),
              )
            }
            className="h-11"
          />
          {type === "expense" && (
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                min={2}
                max={60}
                placeholder="할부 개월 (2~60)"
                aria-label="할부 개월"
                {...form.register("installmentMonths", {
                  setValueAs: (value) => (value === "" ? null : Number(value)),
                })}
                className="h-11"
              />
              <Input
                type="number"
                min={1}
                placeholder="현재 회차"
                aria-label="할부 현재 회차"
                {...form.register("installmentCurrent", {
                  setValueAs: (value) => (value === "" ? null : Number(value)),
                })}
                className="h-11"
              />
            </div>
          )}
        </div>
      )}

      {firstError && (
        <p role="alert" className="text-sm text-expense-fg">
          {String(firstError)}
        </p>
      )}

      <Button
        type="submit"
        disabled={isPending}
        data-testid="save-transaction"
        className="h-12 w-full bg-ink text-base text-surface-raised hover:bg-ink/90"
      >
        {isPending ? "저장 중…" : submitLabel}
      </Button>
    </form>
  )
}
