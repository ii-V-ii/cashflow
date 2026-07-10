import { TRADE_IMMUTABLE_FIELDS, updateTradeMemoSchema } from "@/lib/validators"
import { ApiError } from "@/server/api-errors"
import { guarded } from "@/server/api-guard"
import { jsonSuccess } from "@/server/api-response"
import { parseJsonBody, type IdRouteContext } from "@/server/request"
import {
  deleteTrade,
  getTrade,
  updateTradeMemo,
} from "@/server/services/investment-trade-service"

/** GET /api/v1/investment-trades/{id} (API.md §11.3) */
export async function GET(
  _request: Request,
  context: IdRouteContext,
): Promise<Response> {
  return guarded(async () => {
    const { id } = await context.params
    return jsonSuccess(await getTrade(id))
  })
}

/**
 * PATCH /api/v1/investment-trades/{id} — 메모만 수정 (API.md §11.4).
 * FIFO 영향 필드 전달 시 422 IMMUTABLE_TRADE_FIELD (삭제 후 재등록 안내).
 */
export async function PATCH(
  request: Request,
  context: IdRouteContext,
): Promise<Response> {
  return guarded(async () => {
    const { id } = await context.params
    const body = await parseJsonBody(request)

    if (body !== null && typeof body === "object") {
      const immutable = TRADE_IMMUTABLE_FIELDS.find((field) => field in body)
      if (immutable !== undefined) {
        throw new ApiError(
          422,
          "IMMUTABLE_TRADE_FIELD",
          `${immutable}는 수정할 수 없습니다. 매매 기록을 삭제 후 다시 등록하세요`,
        )
      }
    }

    const input = updateTradeMemoSchema.parse(body)
    return jsonSuccess(await updateTradeMemo(id, input))
  })
}

/** DELETE /api/v1/investment-trades/{id} — 역FIFO (API.md §11.5) */
export async function DELETE(
  _request: Request,
  context: IdRouteContext,
): Promise<Response> {
  return guarded(async () => {
    const { id } = await context.params
    return jsonSuccess(await deleteTrade(id))
  })
}
