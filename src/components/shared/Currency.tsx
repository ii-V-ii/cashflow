"use client"

import { formatCurrency } from "@/lib/utils"
import { cn } from "@/lib/utils"

interface CurrencyProps {
  amount: number
  className?: string
  /** Show color based on sign: positive=emerald, negative=rose */
  colorBySign?: boolean
}

export function Currency({ amount, className, colorBySign = false }: CurrencyProps) {
  const signColor = colorBySign
    ? amount >= 0
      ? "text-emerald-600"
      : "text-rose-600"
    : ""

  return (
    <span className={cn("font-mono", signColor, className)}>
      <span className="font-sans text-[0.85em]">₩</span>
      {formatCurrency(amount)}
    </span>
  )
}
