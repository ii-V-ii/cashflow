"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  createValuationSchema,
  type CreateValuationInput,
  type CreateValuationFormInput,
} from "@/lib/validators/asset"

interface ValuationFormProps {
  onSubmit: (data: CreateValuationInput) => void
  isPending: boolean
}

export function ValuationForm({ onSubmit, isPending }: ValuationFormProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateValuationFormInput, unknown, CreateValuationInput>({
    resolver: zodResolver(createValuationSchema),
    defaultValues: {
      date: new Date().toISOString().slice(0, 10),
      value: 0,
      source: "manual",
      memo: null,
    },
  })

  const handleFormSubmit = (data: CreateValuationInput) => {
    onSubmit(data)
    reset()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">평가 입력</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit(handleFormSubmit)}
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <div className="flex flex-col gap-1.5 flex-1">
            <label htmlFor="val-date" className="text-sm font-medium">
              날짜
            </label>
            <Input
              id="val-date"
              type="date"
              {...register("date")}
              aria-invalid={!!errors.date}
            />
          </div>

          <div className="flex flex-col gap-1.5 flex-1">
            <label htmlFor="val-value" className="text-sm font-medium">
              평가금액 (원)
            </label>
            <Input
              id="val-value"
              type="number"
              placeholder="0"
              {...register("value", { valueAsNumber: true })}
              aria-invalid={!!errors.value}
            />
          </div>

          <div className="flex flex-col gap-1.5 flex-1">
            <label htmlFor="val-memo" className="text-sm font-medium">
              메모
            </label>
            <Input
              id="val-memo"
              placeholder="선택사항"
              {...register("memo")}
            />
          </div>

          <Button type="submit" disabled={isPending} className="shrink-0">
            {isPending ? "저장 중..." : "저장"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
