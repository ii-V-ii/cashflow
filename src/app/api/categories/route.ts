import { NextRequest } from 'next/server'
import { findAllCategories, findAllGrouped, createCategory } from '@/db/repositories'
import { createCategorySchema } from '@/lib/validators'
import { successResponse, errorResponse } from '@/lib/api-response'

export async function GET(request: NextRequest) {
  const grouped = request.nextUrl.searchParams.get('grouped') === 'true'

  if (grouped) {
    const data = await findAllGrouped()
    return Response.json(successResponse(data))
  }

  const categories = await findAllCategories()
  return Response.json(successResponse(categories))
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const parsed = createCategorySchema.safeParse(body)

  if (!parsed.success) {
    return Response.json(
      errorResponse('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다'),
      { status: 400 },
    )
  }

  const category = await createCategory(parsed.data)
  return Response.json(successResponse(category), { status: 201 })
}
