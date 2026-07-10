import { Suspense } from "react"

import { BudgetsScreen } from "@/features/budgets/components/budgets-screen"

export const metadata = { title: "예산 - 금전출납부" }

/** 예산 — 하단 탭 바 예산 슬롯 (PRD §3.5) */
export default function BudgetsPage() {
  return (
    <Suspense>
      <BudgetsScreen />
    </Suspense>
  )
}
