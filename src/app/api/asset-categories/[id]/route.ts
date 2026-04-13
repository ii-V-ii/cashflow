import { NextRequest } from 'next/server'
import { findAssetCategoryById, updateAssetCategory, deleteAssetCategory } from '@/db/repositories'
import { updateAssetCategorySchema } from '@/lib/validators'
import { successResponse, errorResponse } from '@/lib/api-response'

type Context = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Context) {
  const { id } = await params
  const category = await findAssetCategoryById(id)

  if (!category) {
    return Response.json(errorResponse('NOT_FOUND', '자산 카테고리를 찾을 수 없습니다'), { status: 404 })
  }

  return Response.json(successResponse(category))
}

export async function PUT(request: NextRequest, { params }: Context) {
  const { id } = await params
  const body = await request.json()
  const parsed = updateAssetCategorySchema.safeParse(body)

  if (!parsed.success) {
    return Response.json(
      errorResponse('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다'),
      { status: 400 },
    )
  }

  const category = await updateAssetCategory(id, parsed.data)
  if (!category) {
    return Response.json(errorResponse('NOT_FOUND', '자산 카테고리를 찾을 수 없습니다'), { status: 404 })
  }

  return Response.json(successResponse(category))
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  const { id } = await params
  const deleted = await deleteAssetCategory(id)

  if (!deleted) {
    return Response.json(errorResponse('NOT_FOUND', '자산 카테고리를 찾을 수 없습니다'), { status: 404 })
  }

  return Response.json(successResponse({ deleted: true }))
}
