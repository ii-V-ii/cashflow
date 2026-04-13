import { describe, it, expect } from 'vitest'
import { successResponse, errorResponse, paginatedResponse } from '@/lib/api-response'

describe('successResponse', () => {
  it('성공 응답을 생성한다', () => {
    const result = successResponse({ id: '1', name: 'test' })
    expect(result).toEqual({
      success: true,
      data: { id: '1', name: 'test' },
    })
  })

  it('메타 정보를 포함할 수 있다', () => {
    const meta = { total: 100, page: 1, limit: 20, totalPages: 5 }
    const result = successResponse([1, 2, 3], meta)
    expect(result).toEqual({
      success: true,
      data: [1, 2, 3],
      meta,
    })
  })
})

describe('errorResponse', () => {
  it('에러 응답을 생성한다', () => {
    const result = errorResponse('NOT_FOUND', '거래를 찾을 수 없습니다')
    expect(result).toEqual({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: '거래를 찾을 수 없습니다',
      },
    })
  })
})

describe('paginatedResponse', () => {
  it('페이지네이션 응답을 생성한다', () => {
    const items = [{ id: '1' }, { id: '2' }]
    const result = paginatedResponse(items, { total: 50, page: 1, limit: 20 })
    expect(result).toEqual({
      success: true,
      data: items,
      meta: {
        total: 50,
        page: 1,
        limit: 20,
        totalPages: 3,
      },
    })
  })

  it('totalPages를 올바르게 계산한다', () => {
    const result = paginatedResponse([], { total: 0, page: 1, limit: 20 })
    expect(result.meta.totalPages).toBe(0)
  })

  it('정확히 나누어 떨어지는 경우를 처리한다', () => {
    const result = paginatedResponse([], { total: 40, page: 1, limit: 20 })
    expect(result.meta.totalPages).toBe(2)
  })
})
