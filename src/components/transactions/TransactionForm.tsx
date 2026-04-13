"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useGroupedCategories } from "@/hooks/use-categories"
import { useAccounts } from "@/hooks/use-accounts"
import { useCreateTransaction } from "@/hooks/use-transactions"

const formSchema = z.object({
  type: z.enum(["income", "expense", "transfer"]),
  amount: z.number().int().positive(),
  description: z.string().min(1).max(200),
  categoryId: z.string().optional(),
  accountId: z.string().min(1),
  toAccountId: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  memo: z.string().max(500).optional(),
})

type FormValues = z.infer<typeof formSchema>

const TYPE_LABELS = {
  income: "수입",
  expense: "지출",
  transfer: "이체",
} as const

export function TransactionForm() {
  const [open, setOpen] = useState(false)
  const { data: grouped } = useGroupedCategories()
  const { data: accounts } = useAccounts()
  const createMutation = useCreateTransaction()

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: "expense",
      amount: 0,
      description: "",
      accountId: "",
      date: new Date().toISOString().slice(0, 10),
      memo: "",
    },
  })

  const currentType = form.watch("type")

  function handleTabChange(value: string) {
    form.setValue("type", value as FormValues["type"])
    form.setValue("categoryId", undefined)
    form.setValue("toAccountId", undefined)
  }

  async function onSubmit(values: FormValues) {
    await createMutation.mutateAsync({
      ...values,
      categoryId: values.categoryId || null,
      toAccountId: values.toAccountId || null,
      memo: values.memo || null,
    })
    form.reset()
    setOpen(false)
  }

  const filteredGrouped = grouped?.filter(
    (c) => c.type === (currentType === "transfer" ? "expense" : currentType),
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <Plus className="size-4" data-icon="inline-start" />
            새 거래
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>새 거래 등록</DialogTitle>
          <DialogDescription>거래 정보를 입력하세요.</DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <Tabs defaultValue="expense" onValueChange={handleTabChange}>
            <TabsList className="w-full">
              {(["income", "expense", "transfer"] as const).map((t) => (
                <TabsTrigger key={t} value={t}>
                  {TYPE_LABELS[t]}
                </TabsTrigger>
              ))}
            </TabsList>

            {(["income", "expense", "transfer"] as const).map((t) => (
              <TabsContent key={t} value={t} className="space-y-3 pt-2">
                {/* 날짜 */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    날짜
                  </label>
                  <Input type="date" {...form.register("date")} />
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
                      금액은 1원 이상의 정수여야 합니다
                    </p>
                  )}
                </div>

                {/* 설명 */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    설명
                  </label>
                  <Input
                    placeholder="거래 내용"
                    {...form.register("description")}
                  />
                  {form.formState.errors.description && (
                    <p className="text-xs text-destructive mt-1">
                      설명을 입력하세요
                    </p>
                  )}
                </div>

                {/* 계좌 선택 */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    {t === "transfer" ? "출발 계좌" : "계좌"}
                  </label>
                  <select
                    className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    {...form.register("accountId")}
                  >
                    <option value="">선택하세요</option>
                    {accounts?.filter((a) => a.isActive).map((a) => (
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
                      className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      {...form.register("toAccountId")}
                    >
                      <option value="">선택하세요</option>
                      {accounts?.filter((a) => a.isActive).map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* 카테고리 (수입/지출만) - 대분류/소분류 */}
                {t !== "transfer" && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      카테고리
                    </label>
                    <select
                      className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      {...form.register("categoryId")}
                    >
                      <option value="">미분류</option>
                      {filteredGrouped?.map((parent) =>
                        parent.children.length > 0 ? (
                          <optgroup key={parent.id} label={parent.name}>
                            {parent.children.map((child) => (
                              <option key={child.id} value={child.id}>
                                {child.name}
                              </option>
                            ))}
                          </optgroup>
                        ) : (
                          <option key={parent.id} value={parent.id}>
                            {parent.name}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                )}

                {/* 메모 */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    메모
                  </label>
                  <Input placeholder="메모 (선택)" {...form.register("memo")} />
                </div>
              </TabsContent>
            ))}
          </Tabs>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>취소</DialogClose>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
