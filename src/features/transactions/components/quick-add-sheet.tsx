"use client"

import { BottomSheet } from "@/components/ui/bottom-sheet"
import { useCreateTransaction } from "@/features/transactions/hooks/use-transaction-mutations"
import { TransactionForm } from "@/features/transactions/components/transaction-form"
import type { CreateTransactionInput } from "@/lib/validators/transaction"
import { useToastStore } from "@/stores/toast-store"
import { useUiStore } from "@/stores/ui-store"

/**
 * 빠른 거래 입력 바텀 시트 (UI.md §4.2) — 어느 화면에서든 ＋ 1탭.
 * 저장 즉시 시트 닫힘 + 낙관적 반영 + "기록됨" 토스트.
 */
export function QuickAddSheet() {
  const isOpen = useUiStore((state) => state.isQuickAddOpen)
  const close = useUiStore((state) => state.closeQuickAdd)
  const lastAccountId = useUiStore((state) => state.lastAccountId)
  const lastType = useUiStore((state) => state.lastType)
  const rememberDefaults = useUiStore((state) => state.rememberDefaults)
  const showToast = useToastStore((state) => state.show)

  const createMutation = useCreateTransaction()

  function handleSubmit(input: CreateTransactionInput) {
    rememberDefaults(input.accountId, input.type)
    // 낙관적 업데이트 — 응답을 기다리지 않고 즉시 닫는다 (체감 0ms)
    createMutation.mutate(input)
    close()
    showToast("기록되었습니다")
  }

  return (
    <BottomSheet open={isOpen} onOpenChange={(open) => !open && close()} title="빠른 거래 입력">
      {isOpen && (
        <TransactionForm
          defaultType={lastType}
          defaultAccountId={lastAccountId}
          isPending={false}
          submitLabel="저장"
          onSubmit={handleSubmit}
        />
      )}
    </BottomSheet>
  )
}
