import { NextRequest } from 'next/server'
import { findCategoryById, updateCategory, deleteCategory } from '@/db/repositories'
import { updateCategorySchema } from '@/lib/validators'
import { successResponse, errorResponse } from '@/lib/api-response'

type Context = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Context) {
  const { id } = await params
  const category = await findCategoryById(id)

  if (!category) {
    return Response.json(errorResponse('NOT_FOUND', '카테고리를 찾을 수 없습니다'), { status: 404 })
  }

  return Response.json(successResponse(category))
}

export async function PUT(request: NextRequest, { params }: Context) {
  const { id } = await params
  const body = await request.json()
  const parsed = updateCategorySchema.safeParse(body)

  if (!parsed.success) {
    return Response.json(
      errorResponse('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다'),
      { status: 400 },
    )
  }

  const category = await updateCategory(id, parsed.data)
  if (!category) {
    return Response.json(errorResponse('NOT_FOUND', '카테고리를 찾을 수 없습니다'), { status: 404 })
  }

  return Response.json(successResponse(category))
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  const { id } = await params
  const result = await deleteCategory(id)

  if (!result.deleted) {
    if (result.error === 'NOT_FOUND') {
      return Response.json(errorResponse('NOT_FOUND', '카테고리를 찾을 수 없습니다'), { status: 404 })
    }
    return Response.json(errorResponse('DELETE_BLOCKED', result.error ?? '삭제할 수 없습니다'), { status: 409 })
  }

  return Response.json(successResponse({ deleted: true }))
}
