import { apiFetch } from "@/lib/api/http"
import type { AnnualSettlementDto, MonthlySettlementDto } from "@/types/api"

/** GET /api/v1/settlements/monthly — 월 결산 1왕복 (API.md §7.1) */
export function getMonthlySettlement(ym: string): Promise<MonthlySettlementDto> {
  const [year, month] = ym.split("-").map(Number)
  return apiFetch(`/api/v1/settlements/monthly?year=${year}&month=${month}`)
}

/** GET /api/v1/settlements/annual — 연간 결산 1왕복 (API.md §7.2) */
export function getAnnualSettlement(year: number): Promise<AnnualSettlementDto> {
  return apiFetch(`/api/v1/settlements/annual?year=${year}`)
}
