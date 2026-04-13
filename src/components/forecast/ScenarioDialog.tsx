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

const scenarioSchema = z.object({
  name: z.string().min(1, "시나리오 이름을 입력하세요").max(50),
  description: z.string().max(200).optional(),
  incomeGrowthRate: z.number().min(-100).max(100),
  expenseGrowthRate: z.number().min(-100).max(100),
  inflationRate: z.number().min(0).max(100),
  months: z.number().int().min(12).max(60),
})

type FormValues = z.infer<typeof scenarioSchema>

interface ScenarioDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: Record<string, unknown>) => void
  isPending: boolean
}

export function ScenarioDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: ScenarioDialogProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(scenarioSchema),
    defaultValues: {
      name: "",
      description: "",
      incomeGrowthRate: 3,
      expenseGrowthRate: 2,
      inflationRate: 2.5,
      months: 12,
    },
  })

  useEffect(() => {
    if (open) {
      form.reset()
    }
  }, [open, form])

  function handleFormSubmit(values: FormValues) {
    const today = new Date()
    const endDate = new Date(today)
    endDate.setMonth(endDate.getMonth() + values.months)

    onSubmit({
      name: values.name,
      description: values.description || null,
      startDate: today.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
      assumptions: {
        incomeGrowthRate: values.incomeGrowthRate,
        expenseGrowthRate: values.expenseGrowthRate,
        inflationRate: values.inflationRate,
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>새 시나리오</DialogTitle>
          <DialogDescription>
            예측에 사용할 가정 조건을 설정하세요.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(handleFormSubmit)}
          className="space-y-4"
        >
          {/* 이름 */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              시나리오 이름
            </label>
            <Input
              placeholder="낙관적 시나리오"
              {...form.register("name")}
            />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive mt-1">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          {/* 설명 */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              설명 (선택)
            </label>
            <Input
              placeholder="시나리오 설명"
              {...form.register("description")}
            />
          </div>

          {/* 예측 기간 */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              예측 기간 (개월)
            </label>
            <Input
              type="number"
              min={12}
              max={60}
              {...form.register("months", { valueAsNumber: true })}
            />
          </div>

          {/* 가정 조건 */}
          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-xs font-medium text-muted-foreground">
              가정 조건 (연간 %)
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] text-muted-foreground">
                  수입 증가율
                </label>
                <Input
                  type="number"
                  step="0.1"
                  {...form.register("incomeGrowthRate", {
                    valueAsNumber: true,
                  })}
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">
                  지출 변동율
                </label>
                <Input
                  type="number"
                  step="0.1"
                  {...form.register("expenseGrowthRate", {
                    valueAsNumber: true,
                  })}
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">
                  인플레이션
                </label>
                <Input
                  type="number"
                  step="0.1"
                  {...form.register("inflationRate", {
                    valueAsNumber: true,
                  })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>취소</DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? "생성 중..." : "생성"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
