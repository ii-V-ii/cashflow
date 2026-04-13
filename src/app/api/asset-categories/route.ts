import { NextRequest } from 'next/server'
import { findAllAssetCategories, createAssetCategory } from '@/db/repositories'
import { createAssetCategorySchema } from '@/lib/validators'
import { successResponse, errorResponse } from '@/lib/api-response'

export async function GET() {
  const data = await findAllAssetCategories()
  return Response.json(successResponse(data))
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const parsed = createAssetCategorySchema.safeParse(body)

  if (!parsed.success) {
    return Response.json(
      errorResponse('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다'),
      { status: 400 },
    )
  }

  const category = await createAssetCategory(parsed.data)
  return Response.json(successResponse(category), { status: 201 })
}
