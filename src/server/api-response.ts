export type ApiSuccess<T> = {
  success: true
  data: T
}

export type ApiFailure = {
  success: false
  error: {
    code: string
    message: string
  }
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure

const DEFAULT_ERROR_STATUS = 500

export function successResponse<T>(data: T): ApiSuccess<T> {
  return { success: true, data }
}

export function errorResponse(code: string, message: string): ApiFailure {
  return { success: false, error: { code, message } }
}

export function jsonSuccess<T>(data: T, init?: ResponseInit): Response {
  return Response.json(successResponse(data), init)
}

export function jsonError(
  code: string,
  message: string,
  init?: ResponseInit,
): Response {
  return Response.json(errorResponse(code, message), {
    status: DEFAULT_ERROR_STATUS,
    ...init,
  })
}
