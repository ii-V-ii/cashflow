"use client"

import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useCategories } from "@/hooks/use-categories"
import { useAccounts } from "@/hooks/use-accounts"
import type { RecurringTransaction, TransactionType } from "@/types"

const formSchema = z.object({
  type: z.enum(["income", "expense", "transfer"]),
  amount: z.number().int().positive("1원 이상 입력하세요"),
  description: z.string().min(1, "설명을 입력하세요").max(200),
  categoryId: z.string().optional(),
  accountId: z.string().min(1, "계좌를 선택하세요"),
  toAccountId: z.string().optional(),
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
  interval: z.number().int().min(1).max(365),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
})

type FormValues = z.infer<typeof formSchema>

const TYPE_LABELS = {
  income: "수입",
  expense: "지출",
  transfer: "이체",
} as const

const FREQUENCY_LABELS = {
  daily: "매일",
  weekly: "매주",
  monthly: "매월",
  yearly: "매년",
} as const

interface RecurringFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: RecurringTransaction | null
  onSubmit: (values: Record<string, unknown>) => void
  isPending: boolean
}

export function RecurringForm({
  open,
  onOpenChange,
  item,
  onSubmit,
  isPending,
}: RecurringFormProps) {
  const { data: categories } = useCategories()
  const { data: accounts } = useAccounts()

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: "expense",
      amount: 0,
      description: "",
      accountId: "",
      frequency: "monthly",
      interval: 1,
      startDate: new Date().toISOString().slice(0, 10),
      endDate: "",
    },
  })

  const currentType = form.watch("type")
  const isEditing = item !== null

  useEffect(() => {
    if (open) {
      if (item) {
        form.reset({
          type: item.type,
          amount: item.amount,
          description: item.description,
          categoryId: item.categoryId ?? undefined,
          accountId: item.accountId,
          toAccountId: item.toAccountId ?? undefined,
          frequency: item.frequency,
          interval: item.interval,
          startDate: item.startDate,
          endDate: item.endDate ?? "",
        })
      } else {
        form.reset({
          type: "expense",
          amount: 0,
          description: "",
          accountId: "",
          frequency: "monthly",
          interval: 1,
          startDate: new Date().toISOString().slice(0, 10),
          endDate: "",
        })
      }
    }
  }, [open, item, form])

  function handleTabChange(value: string) {
    form.setValue("type", value as TransactionType)
    form.setValue("categoryId", undefined)
    form.setValue("toAccountId", undefined)
  }

  function handleFormSubmit(values: FormValues) {
    onSubmit({
      ...values,
      categoryId: values.categoryId || null,
      toAccountId: values.toAccountId || null,
      endDate: values.endDate || null,
    })
  }

  const filteredCategories = categories?.filter(
    (c) => c.type === (currentType === "transfer" ? "expense" : currentType),
  )

  const selectClass =
    "flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "정기 거래 수정" : "정기 거래 등록"}
          </DialogTitle>
          <DialogDescription>
            반복되는 거래를 설정하세요.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(handleFormSubmit)}
          className="space-y-4"
        >
          <Tabs
            defaultValue={item?.type ?? "expense"}
            onValueChange={handleTabChange}
          >
            <TabsList className="w-full">
              {(["income", "expense", "transfer"] as const).map((t) => (
                <TabsTrigger key={t} value={t}>
                  {TYPE_LABELS[t]}
                </TabsTrigger>
              ))}
            </TabsList>

            {(["income", "expense", "transfer"] as const).map((t) => (
              <TabsContent key={t} value={t} className="space-y-3 pt-2">
                {/* 설명 */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    설명
                  </label>
                  <Input
                    placeholder="월세, 구독료 등"
                    {...form.register("description")}
                  />
                  {form.formState.errors.description && (
                    <p className="text-xs text-destructive mt-1">
                      {form.formState.errors.description.message}
                    </p>
                  )}
                </div>

                {/* 금액 */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    금액 (원)
                  </label>
                  <Input
                    type="number"
                    placeholder="0"
                    {...form.register("amount", { valueAsNumber: true })}
                  />
                  {form.formState.errors.amount && (
                    <p className="text-xs text-destructive mt-1">
                      {form.formState.errors.amount.message}
                    </p>
                  )}
                </div>

                {/* 계좌 */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    {t === "transfer" ? "출발 계좌" : "계좌"}
                  </label>
                  <select className={selectClass} {...form.register("accountId")}>
                    <option value="">선택하세요</option>
                    {accounts
                      ?.filter((a) => a.isActive)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </div>

                {/* 이체: 도착 계좌 */}
                {t === "transfer" && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      도착 계좌
                    </label>
                    <select
                      className={selectClass}
                      {...form.register("toAccountId")}
                    >
                      <option value="">선택하세요</option>
                      {accounts
                        ?.filter((a) => a.isActive)
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                {/* 카테고리 */}
                {t !== "transfer" && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      카테고리
                    </label>
                    <select
                      className={selectClass}
                      {...form.register("categoryId")}
                    >
                      <option value="">미분류</option>
                      {filteredCategories?.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* 빈도 + 간격 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      반복 주기
                    </label>
                    <select
                      className={selectClass}
                      {...form.register("frequency")}
                    >
                      {(
                        Object.entries(FREQUENCY_LABELS) as [
                          keyof typeof FREQUENCY_LABELS,
                          string,
                        ][]
                      ).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      간격
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      {...form.register("interval", { valueAsNumber: true })}
                    />
                  </div>
                </div>

                {/* 시작/종료일 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      시작일
                    </label>
                    <Input type="date" {...form.register("startDate")} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      종료일 (선택)
                    </label>
                    <Input type="date" {...form.register("endDate")} />
                  </div>
                </div>
              </TabsContent>
            ))}
          </Tabs>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>취소</DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? "저장 중..." : isEditing ? "수정" : "등록"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
