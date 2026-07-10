import { apiFetch } from "@/lib/api/http"
import type { DashboardDto } from "@/types/api"

/** GET /api/v1/dashboard — get_dashboard RPC 1왕복 (API.md §8.1) */
export function getDashboard(ym: string): Promise<DashboardDto> {
  const [year, month] = ym.split("-").map(Number)
  return apiFetch(`/api/v1/dashboard?year=${year}&month=${month}`)
}
