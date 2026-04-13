import { NextRequest } from 'next/server'
import { getAssetsService, createAssetService } from '@/lib/services/asset-service'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const type = searchParams.get('type') ?? undefined
  const category = searchParams.get('category') ?? undefined
  const activeOnly = searchParams.get('activeOnly') !== 'false'

  const result = await getAssetsService({ type, category, activeOnly })
  return Response.json(result)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const result = await createAssetService(body)
  const status = result.success ? 201 : 400
  return Response.json(result, { status })
}
