import { cn } from "@/lib/utils"
import type { TransactionDto } from "@/types/api"

/** 유형 배지 — 색 + 레이블 병행 (색만으로 의미 전달 금지, UI.md §7) */
export function TypeBadge({ transaction }: { transaction: TransactionDto }) {
  const isSaving =
    transaction.type === "expense" &&
    (transaction.toAccountId !== null ||
      transaction.category?.expenseKind === "saving")

  const config = isSaving
    ? { label: "저축", className: "bg-saving-subtle text-saving-fg" }
    : transaction.type === "income"
      ? { label: "수입", className: "bg-income-subtle text-income-fg" }
      : transaction.type === "transfer"
        ? { label: "이체", className: "bg-transfer-subtle text-transfer-fg" }
        : { label: "지출", className: "bg-expense-subtle text-expense-fg" }

  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={cn(
          "rounded-md px-1.5 py-0.5 text-[11px] font-medium",
          config.className,
        )}
      >
        {config.label}
      </span>
      {transaction.installmentMonths && (
        <span className="rounded-md bg-surface-sunken px-1.5 py-0.5 text-[11px] text-ink-muted">
          할부 {transaction.installmentCurrent ?? 1}/{transaction.installmentMonths}
        </span>
      )}
      {transaction.status === "pending" && (
        <span className="rounded-md border border-hairline px-1.5 py-0.5 text-[11px] text-ink-muted">
          예정
        </span>
      )}
    </span>
  )
}

/** 금액 색: 수입 +green / 지출 −red / 저축 violet / 이체 blue (UI.md §3.2) */
export function amountClass(transaction: TransactionDto): string {
  const isSaving =
    transaction.type === "expense" &&
    (transaction.toAccountId !== null ||
      transaction.category?.expenseKind === "saving")
  if (isSaving) return "text-saving-fg"
  if (transaction.type === "income") return "text-income-fg"
  if (transaction.type === "transfer") return "text-transfer-fg"
  return "text-expense-fg"
}
