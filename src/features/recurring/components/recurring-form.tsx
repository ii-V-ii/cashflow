"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useEffect } from "react"
import { useForm } from "react-hook-form"
import type { z } from "zod"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAccounts } from "@/features/accounts/hooks/use-accounts"
import { useCategories } from "@/features/categories/hooks/use-categories"
import { formatKrw } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  createRecurringSchema,
  type CreateRecurringInput,
} from "@/lib/validators/recurring"
import type { RecurringDto } from "@/types/api"

const TYPE_OPTIONS = [
  { value: "expense", label: "지출", activeClass: "bg-expense-subtle text-expense-fg" },
  { value: "income", label: "수입", activeClass: "bg-income-subtle text-income-fg" },
  { value: "transfer", label: "이체", activeClass: "bg-transfer-subtle text-transfer-fg" },
] as const

const FREQUENCY_OPTIONS = [
  { value: "daily", label: "매일" },
  { value: "weekly", label: "매주" },
  { value: "monthly", label: "매월" },
  { value: "yearly", label: "매년" },
] as const

function todayString(): string {
  const date = new Date()
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/** 폼 값 타입 — interval의 .default(1) 때문에 입력(z.input)과 출력(z.infer)이 다르다 */
type RecurringFormValues = z.input<typeof createRecurringSchema>

export interface RecurringFormProps {
  initial?: RecurringDto
  isPending: boolean
  submitLabel: string
  onSubmit: (input: CreateRecurringInput) => void
}

/** 정기 거래 규칙 폼 (PRD §3.2 정기 거래 탭) — 주기·금액·계좌·카테고리·시작/종료일 */
export function RecurringForm({
  initial,
  isPending,
  submitLabel,
  onSubmit,
}: RecurringFormProps) {
  const { data: accounts = [] } = useAccounts()

  const form = useForm<RecurringFormValues, unknown, CreateRecurringInput>({
    resolver: zodResolver(createRecurringSchema),
    defaultValues: initial
      ? {
          type: initial.type,
          amount: initial.amount,
          description: initial.description,
          categoryId: initial.categoryId,
          accountId: initial.accountId,
          toAccountId: initial.toAccountId,
          frequency: initial.frequency,
          interval: initial.interval,
          startDate: initial.startDate,
          endDate: initial.endDate,
        }
      : {
          type: "expense",
          amount: undefined,
          description: "",
          categoryId: null,
          accountId: accounts[0]?.id ?? "",
          toAccountId: null,
          frequency: "monthly",
          interval: 1,
          startDate: todayString(),
          endDate: null,
        },
  })

  // 계좌 목록이 늦게 도착했을 때 기본 계좌 채움 (transaction-form과 동일)
  useEffect(() => {
    if (!form.getValues("accountId") && accounts.length > 0) {
      form.setValue("accountId", accounts[0].id)
    }
  }, [accounts, form])

  const type = form.watch("type")
  const categoryId = form.watch("categoryId")
  const amount = form.watch("amount")
  const { data: categories = [] } = useCategories(
    type === "transfer" ? undefined : type,
  )
  const categoryChips = type === "transfer" ? [] : categories

  const amountRegister = form.register("amount", {
    setValueAs: (value) => {
      const digits = String(value).replace(/[^\d]/g, "")
      return digits === "" ? undefined : Number(digits)
    },
  })

  function submit(input: CreateRecurringInput) {
    onSubmit({
      ...input,
      toAccountId: input.type === "transfer" ? input.toAccountId : null,
      categoryId: input.type === "transfer" ? null : input.categoryId,
    })
  }

  const errors = form.formState.errors
  const firstError = Object.values(errors)[0]?.message

  return (
    <form
      onSubmit={(event) => void form.handleSubmit(submit)(event)}
      className="flex flex-col gap-4"
      data-testid="recurring-form"
    >
      {/* 유형 세그먼트 */}
      <div
        role="radiogroup"
        aria-label="거래 유형"
        className="grid grid-cols-3 gap-1 rounded-xl bg-surface-sunken p-1"
      >
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

      {/* 금액 */}
      <div className="flex items-baseline gap-2">
        <Input
          {...amountRegister}
          inputMode="numeric"
          autoComplete="off"
          placeholder="0"
          aria-label="금액"
          data-testid="recurring-amount-input"
          defaultValue={initial ? String(initial.amount) : ""}
          className="amount h-14 rounded-none border-0 border-b-2 border-hairline bg-transparent px-1 text-right text-amount-hero font-semibold text-ink focus-visible:ring-0"
        />
        <span className="shrink-0 text-lg text-ink-muted">원</span>
      </div>
      {typeof amount === "number" && amount > 0 && (
        <p className="amount -mt-3 text-right text-xs text-ink-muted">
          {formatKrw(amount)}
        </p>
      )}

      {/* 내용 */}
      <Input
        {...form.register("description")}
        placeholder="내용 (예: 월세, OTT 구독)"
        aria-label="내용"
        data-testid="recurring-description-input"
        className="h-11"
      />

      {/* 카테고리 칩 */}
      {categoryChips.length > 0 && (
        <div
          className="flex gap-1.5 overflow-x-auto pb-1"
          role="listbox"
          aria-label="카테고리"
        >
          {categoryChips.map((category) => (
            <button
              key={category.id}
              type="button"
              role="option"
              aria-selected={categoryId === category.id}
              onClick={() =>
                form.setValue(
                  "categoryId",
                  categoryId === category.id ? null : category.id,
                )
              }
              data-testid={`recurring-category-chip-${category.name}`}
              className={cn(
                "h-11 shrink-0 rounded-full border border-hairline px-4 text-sm font-medium text-ink-muted transition-colors",
                categoryId === category.id &&
                  (type === "income"
                    ? "border-income bg-income-subtle text-income-fg"
                    : "border-expense bg-expense-subtle text-expense-fg"),
              )}
            >
              {category.name}
            </button>
          ))}
        </div>
      )}

      {/* 계좌 */}
      <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
        {type === "income" ? "입금 계좌" : "출금 계좌"}
        <select
          {...form.register("accountId")}
          data-testid="recurring-account-select"
          className="h-11 rounded-lg border border-hairline bg-surface-raised px-3 text-sm text-ink"
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </label>

      {type === "transfer" && (
        <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
          이체 입금 계좌
          <select
            {...form.register("toAccountId", {
              setValueAs: (value) => (value === "" ? null : value),
            })}
            data-testid="recurring-to-account-select"
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

      {/* 주기 + 간격 */}
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
          주기
          <select
            {...form.register("frequency")}
            data-testid="recurring-frequency-select"
            className="h-11 rounded-lg border border-hairline bg-surface-raised px-3 text-sm text-ink"
          >
            {FREQUENCY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
          간격
          <Input
            type="number"
            min={1}
            max={365}
            {...form.register("interval", { valueAsNumber: true })}
            aria-label="간격"
            className="h-11"
          />
        </label>
      </div>

      {/* 시작일/종료일 */}
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
          시작일
          <Input
            type="date"
            {...form.register("startDate")}
            aria-label="시작일"
            data-testid="recurring-start-date"
            className="h-11"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
          종료일 (선택)
          <Input
            type="date"
            {...form.register("endDate", {
              setValueAs: (value) => (value === "" ? null : value),
            })}
            aria-label="종료일"
            className="h-11"
          />
        </label>
      </div>

      {firstError && (
        <p role="alert" className="text-sm text-expense-fg">
          {String(firstError)}
        </p>
      )}

      <Button
        type="submit"
        disabled={isPending}
        data-testid="recurring-submit"
        className="h-12 w-full text-base"
      >
        {isPending ? "저장 중…" : submitLabel}
      </Button>
    </form>
  )
}
