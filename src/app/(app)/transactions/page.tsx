import { Suspense } from "react"

import { TransactionsScreen } from "@/features/transactions/components/transactions-screen"

export const metadata = { title: "거래 - 금전출납부" }

export default function TransactionsPage() {
  return (
    <Suspense>
      <TransactionsScreen />
    </Suspense>
  )
}
