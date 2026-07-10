"use client"

import { Input } from "@/components/ui/input"
import { MAX_KRW_AMOUNT } from "@/lib/validators/common"
import { cn } from "@/lib/utils"

function parseAmount(text: string): number {
  const digits = text.replace(/[^\d]/g, "")
  if (digits === "") return 0
  return Math.min(Number(digits), MAX_KRW_AMOUNT)
}

/** 천 단위 구분 표시 금액 입력 — 0은 빈 칸(placeholder 0) */
export function AmountInput({
  value,
  onChange,
  className,
  ...props
}: {
  value: number
  onChange: (value: number) => void
  className?: string
} & Omit<React.ComponentProps<"input">, "value" | "onChange" | "type">) {
  return (
    <Input
      inputMode="numeric"
      autoComplete="off"
      placeholder="0"
      value={value === 0 ? "" : value.toLocaleString("ko-KR")}
      onChange={(event) => onChange(parseAmount(event.target.value))}
      className={cn("text-right tabular-nums", className)}
      {...props}
    />
  )
}
