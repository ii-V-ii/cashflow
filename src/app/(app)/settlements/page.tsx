import { Suspense } from "react"

import { SettlementsScreen } from "@/features/settlements/components/settlements-screen"

export const metadata = { title: "결산 - 금전출납부" }

export default function SettlementsPage() {
  return (
    <Suspense>
      <SettlementsScreen />
    </Suspense>
  )
}
