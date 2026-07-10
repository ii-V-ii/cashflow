import { ApiError } from "@/server/api-errors"

/** 요청 본문 JSON 파싱 — 실패 시 400 VALIDATION_ERROR (500으로 새지 않게) */
export async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new ApiError(400, "VALIDATION_ERROR", "요청 본문이 올바른 JSON이 아닙니다")
  }
}

/** URL 쿼리스트링 → 평면 객체 (Zod 쿼리 스키마 입력) */
export function queryParams(request: Request): Record<string, string> {
  return Object.fromEntries(new URL(request.url).searchParams)
}

/** Next.js 16 라우트 컨텍스트 — params는 Promise (route.md) */
export interface IdRouteContext {
  params: Promise<{ id: string }>
}
