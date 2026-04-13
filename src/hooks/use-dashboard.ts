"use client"

import { useQuery } from "@tanstack/react-query"
import { apiGet } from "@/lib/api-client"

interface DashboardData {
  totalBalance: number
  monthlyIncome: number
  monthlyExpense: number
  monthlyNet: number
  accountCount: number
  recentTransactions: Array<{
    id: string
    type: string
    amount: number
    description: string
    date: string
    accountId: string
    categoryId: string | null
    tags: string[]
  }>
}

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: () => apiGet<DashboardData>("/api/dashboard"),
  })
}
