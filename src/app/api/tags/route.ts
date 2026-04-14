import { NextRequest } from 'next/server'
import { like, desc } from 'drizzle-orm'
import { getDb } from '@/db'
import { tags } from '@/db/schema'
import { successResponse, errorResponse } from '@/lib/api-response'

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get('q')
    const db = getDb()

    const rows = q
      ? await db
          .select({ id: tags.id, name: tags.name, color: tags.color })
          .from(tags)
          .where(like(tags.name, `%${q}%`))
          .orderBy(tags.name)
          .limit(20)
      : await db
          .select({ id: tags.id, name: tags.name, color: tags.color })
          .from(tags)
          .orderBy(desc(tags.createdAt))
          .limit(100)

    return Response.json(successResponse(rows))
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return Response.json(errorResponse('TAGS_FETCH_FAILED', message), { status: 500 })
  }
}
