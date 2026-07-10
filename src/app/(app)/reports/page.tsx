import { Suspense } from "react"

import { ReportsScreen } from "@/features/reports/components/reports-screen"

export const metadata = { title: "보고서 - 금전출납부" }

export default function ReportsPage() {
  return (
    <Suspense>
      <ReportsScreen />
    </Suspense>
  )
}
