import "server-only"

import type {
  SettlementAnnualQuery,
  SettlementMonthlyQuery,
} from "@/lib/validators"
import { callRpc } from "@/server/rpc"
import {
  mapAnnualSettlement,
  mapMonthlySettlement,
  type RawAnnualSettlement,
  type RawMonthlySettlement,
} from "@/server/services/settlement-mapping"
import type { AnnualSettlementDto, MonthlySettlementDto } from "@/types/api"

/** GET /settlements/monthly — get_monthly_settlement RPC 1왕복 (API.md §7.1) */
export async function getMonthlySettlement(
  query: SettlementMonthlyQuery,
): Promise<MonthlySettlementDto> {
  const raw = await callRpc<RawMonthlySettlement>("get_monthly_settlement", {
    p_year: query.year,
    p_month: query.month,
  })
  return mapMonthlySettlement(raw)
}

/** GET /settlements/annual — get_annual_settlement RPC 1왕복, 월 12회 호출 금지 (API.md §7.2) */
export async function getAnnualSettlement(
  query: SettlementAnnualQuery,
): Promise<AnnualSettlementDto> {
  const raw = await callRpc<RawAnnualSettlement>("get_annual_settlement", {
    p_year: query.year,
  })
  return mapAnnualSettlement(raw)
}
