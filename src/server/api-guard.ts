import {
  mapApiError,
  type MapApiErrorOptions,
} from "@/server/api-errors"
import { jsonError } from "@/server/api-response"
import { getAuthUser, type AuthUser } from "@/server/auth"

/**
 * /api/v1 라우트 공통 가드: 세션 검증(401) + 소유자 검증(403) + 에러 → §16 코드 매핑.
 * 모든 라우트 핸들러는 본문을 이 래퍼 안에서 실행한다 (API.md §1.2, §16).
 *
 * 소유자 검증(SEC-H1): 단일 사용자 앱의 실질 인가 경계는 이 함수다 —
 * 세션이 유효해도 OWNER_EMAIL과 일치하지 않으면 403 FORBIDDEN.
 * OWNER_EMAIL 미설정 시 전 요청 거부(fail-closed, 500) + 서버 로그에 원인 기록.
 */
export async function guarded(
  handler: (user: AuthUser) => Promise<Response>,
  options?: MapApiErrorOptions,
): Promise<Response> {
  const user = await getAuthUser()
  if (!user) {
    return jsonError("UNAUTHORIZED", "로그인이 필요합니다", { status: 401 })
  }

  const ownerEmail = process.env.OWNER_EMAIL
  if (!ownerEmail) {
    console.error(
      "[api/v1] OWNER_EMAIL 환경변수가 설정되지 않아 모든 요청을 거부합니다 (fail-closed)",
    )
    return jsonError("INTERNAL_ERROR", "서버 설정 오류가 발생했습니다", {
      status: 500,
    })
  }
  if (user.email !== ownerEmail) {
    return jsonError("FORBIDDEN", "접근 권한이 없습니다", { status: 403 })
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
