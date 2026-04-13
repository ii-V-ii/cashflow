import type {
  ApiSuccessResponse,
  ApiErrorResponse,
  PaginatedResponse,
  PaginationMeta,
} from "@/types"

export function successResponse<T>(
  data: T,
  meta?: PaginationMeta,
): ApiSuccessResponse<T> {
  if (meta) {
    return { success: true, data, meta }
  }
  return { success: true, data }
}

export function errorResponse(
  code: string,
  message: string,
): ApiErrorResponse {
  return { success: false, error: { code, message } }
}

export function paginatedResponse<T>(
  data: readonly T[],
  params: { total: number; page: number; limit: number },
): PaginatedResponse<T> {
  const totalPages = params.limit > 0 ? Math.ceil(params.total / params.limit) : 0
  return {
    success: true,
    data,
    meta: {
      total: params.total,
      page: params.page,
      limit: params.limit,
      totalPages,
    },
  }
}
