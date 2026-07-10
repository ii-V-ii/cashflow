import { ZodError } from "zod"

/** 도메인 규칙 위반 등 라우트/서비스에서 의도적으로 던지는 에러 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
  }
}

export interface MappedApiError {
  status: number
  code: string
  message: string
}

export interface MapApiErrorOptions {
  /**
   * FK 위반(23503)의 해석: 기본은 "참조 대상 없음"(생성/수정 시 404 NOT_FOUND),
   * 삭제 라우트에서는 "참조 중인 자원"(409 REFERENCE_EXISTS)로 뒤집는다 (API.md §16).
   */
  fkMeansReference?: boolean
}

function errorCode(error: unknown): string | null {
  if (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  ) {
    return (error as { code: string }).code
  }
  return null
}

/**
 * DB/RPC/검증 에러 → API.md §16 에러 코드 매핑 (단일 관리).
 * RPC 내부 RAISE EXCEPTION(P0001)은 메시지 규약으로 매핑한다.
 */
export function mapApiError(
  error: unknown,
  options: MapApiErrorOptions = {},
): MappedApiError {
  if (error instanceof ApiError) {
    return { status: error.status, code: error.code, message: error.message }
  }

  if (error instanceof ZodError) {
    const first = error.issues[0]
    return {
      status: 400,
      code: "VALIDATION_ERROR",
      message: first ? `${first.path.join(".")}: ${first.message}` : "잘못된 요청입니다",
    }
  }

  const code = errorCode(error)
  const message = error instanceof Error ? error.message : String(error)

  if (code === "23503") {
    return options.fkMeansReference
      ? {
          status: 409,
          code: "REFERENCE_EXISTS",
          message: "다른 자원이 참조 중이라 삭제할 수 없습니다",
        }
      : { status: 404, code: "NOT_FOUND", message: "참조한 자원이 존재하지 않습니다" }
  }

  // 22008/22007 = 날짜/시간 범위·형식 오류 (예: '2026-02-30'::date) — 검증 우회 방어
  if (
    code === "23514" ||
    code === "22P02" ||
    code === "23505" ||
    code === "22008" ||
    code === "22007"
  ) {
    return {
      status: 400,
      code: "VALIDATION_ERROR",
      message: "요청 값이 데이터 규칙에 맞지 않습니다",
    }
  }

  // RPC RAISE는 커스텀 SQLSTATE 규약으로 매핑한다 (SEC-L2: 메시지 substring 매칭 금지).
  // CF422 = 저축 거래 정합성 위반, CF404 = 자원 없음 — DB.md §3 RAISE 규약과 1:1.
  // CF400/CF423/CF490 = 투자 RPC 규약(마이그레이션 20260713000030 헤더 참조).
  if (code === "CF422") {
    return { status: 422, code: "SAVING_CATEGORY_REQUIRED", message }
  }
  if (code === "CF404") {
    return { status: 404, code: "NOT_FOUND", message: "자원을 찾을 수 없습니다" }
  }
  // CF409 = 동일 year+month 예산 중복 (409 DUPLICATE_BUDGET — API.md §16)
  if (code === "CF409") {
    return { status: 409, code: "DUPLICATE_BUDGET", message }
  }
  if (code === "CF400") {
    return { status: 400, code: "VALIDATION_ERROR", message }
  }
  if (code === "CF423") {
    return { status: 422, code: "INSUFFICIENT_HOLDINGS", message }
  }
  // CF490 = 매도에 소진된 매수 로트 삭제 금지 (머지 시 CF409 충돌 재배정 — 예산 CF409와 분리)
  if (code === "CF490") {
    return { status: 409, code: "TRADE_HAS_DEPENDENTS", message }
  }

  // 상세는 서버 로그에만 — 응답에 노출 금지 (API.md §16 INTERNAL_ERROR)
  return { status: 500, code: "INTERNAL_ERROR", message: "서버 오류가 발생했습니다" }
}
