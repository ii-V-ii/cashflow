import {
  mapApiError,
  type MapApiErrorOptions,
} from "@/server/api-errors"
import { jsonError } from "@/server/api-response"
import { getAuthUser, type AuthUser } from "@/server/auth"

/**
 * /api/v1 라우트 공통 가드: 세션 검증(401 envelope) + 에러 → §16 코드 매핑.
 * 모든 라우트 핸들러는 본문을 이 래퍼 안에서 실행한다 (API.md §1.2, §16).
 */
export async function guarded(
  handler: (user: AuthUser) => Promise<Response>,
  options?: MapApiErrorOptions,
): Promise<Response> {
  const user = await getAuthUser()
  if (!user) {
    return jsonError("UNAUTHORIZED", "로그인이 필요합니다", { status: 401 })
  }

  try {
    return await handler(user)
  } catch (error) {
    const mapped = mapApiError(error, options)
    if (mapped.status >= 500) {
      // 상세는 서버 로그에만 남긴다 (응답 노출 금지)
      console.error("[api/v1]", error)
    }
    return jsonError(mapped.code, mapped.message, { status: mapped.status })
  }
}
