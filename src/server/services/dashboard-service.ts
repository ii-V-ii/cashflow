import "server-only"

import type { DashboardQuery } from "@/lib/validators"
import { callRpc } from "@/server/rpc"
import {
  mapDashboard,
  type RawDashboard,
} from "@/server/services/dashboard-mapping"
import type { DashboardDto } from "@/types/api"

/** GET /dashboard — get_dashboard RPC 1왕복 (API.md §8.1, DB.md §3.9) */
export async function getDashboard(query: DashboardQuery): Promise<DashboardDto> {
  const raw = await callRpc<RawDashboard>("get_dashboard", {
    p_year: query.year,
    p_month: query.month,
  })
  return mapDashboard(raw)
}
