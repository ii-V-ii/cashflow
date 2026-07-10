import { exportTransactionsQuerySchema } from "@/lib/validators"
import { guarded } from "@/server/api-guard"
import { queryParams } from "@/server/request"
import {
  exportFilename,
  exportTransactionsCsv,
} from "@/server/services/export-service"

/** Excel 호환 UTF-8 BOM (API.md §15.1) */
const UTF8_BOM = "\uFEFF"

/**
 * GET /api/v1/export/transactions — 거래 CSV 내보내기 (API.md §15.1).
 * 성공 응답만 envelope 미적용(raw CSV) — 인증·검증 에러는 guarded의 JSON envelope.
 */
export async function GET(request: Request): Promise<Response> {
  return guarded(async () => {
    const query = exportTransactionsQuerySchema.parse(queryParams(request))
    const csv = await exportTransactionsCsv(query)
    return new Response(UTF8_BOM + csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${exportFilename(query)}"`,
      },
    })
  })
}
