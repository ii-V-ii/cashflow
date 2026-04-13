import { NextRequest } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { categories } from '@/db/schema'
import { successResponse, errorResponse } from '@/lib/api-response'

const reorderSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().min(1),
      sortOrder: z.number().int().min(0),
    }),
  ),
})

export async function POST(request: NextRequest) {
  const body = await request.json()
  const parsed = reorderSchema.safeParse(body)

  if (!parsed.success) {
    return Response.json(
      errorResponse('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다'),
      { status: 400 },
    )
  }

  const { items } = parsed.data
  if (items.length === 0) {
    return Response.json(successResponse({ updated: 0 }))
  }

  const db = getDb()
  const now = new Date().toISOString()

  await db.transaction(async (tx) => {
    await Promise.all(
      items.map((item) =>
        tx
          .update(categories)
          .set({ sortOrder: item.sortOrder, updatedAt: now })
          .where(eq(categories.id, item.id)),
      ),
    )
  })

  return Response.json(successResponse({ updated: items.length }))
}
