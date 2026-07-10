import { apiFetch } from "@/lib/api/http"
import type {
  CategoryReportDto,
  NetWorthReportDto,
  TrendReportDto,
} from "@/types/api"

/** GET /api/v1/reports/trend — 수입/지출 추이 (API.md §14.1) */
export function getTrendReport(from: string, to: string): Promise<TrendReportDto> {
  return apiFetch(`/api/v1/reports/trend?from=${from}&to=${to}`)
}

/** GET /api/v1/reports/categories — 카테고리별 지출 도넛 (API.md §14.2) */
export function getCategoryReport(ym: string): Promise<CategoryReportDto> {
  const [year, month] = ym.split("-").map(Number)
  return apiFetch(`/api/v1/reports/categories?year=${year}&month=${month}`)
}

/** GET /api/v1/reports/net-worth — 순자산 추이 (API.md §14.3) */
export function getNetWorthReport(months: number): Promise<NetWorthReportDto> {
  return apiFetch(`/api/v1/reports/net-worth?months=${months}`)
}
