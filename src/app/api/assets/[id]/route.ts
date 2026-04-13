import { NextRequest } from 'next/server'
import {
  getAssetByIdService,
  updateAssetService,
  deleteAssetService,
} from '@/lib/services/asset-service'

type Context = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Context) {
  const { id } = await params
  const result = await getAssetByIdService(id)
  const status = result.success ? 200 : 404
  return Response.json(result, { status })
}

export async function PUT(request: NextRequest, { params }: Context) {
  const { id } = await params
  const body = await request.json()
  const result = await updateAssetService(id, body)
  const status = result.success ? 200 : 'error' in result && result.error.code === 'NOT_FOUND' ? 404 : 400
  return Response.json(result, { status })
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  const { id } = await params
  const result = await deleteAssetService(id)
  const status = result.success ? 200 : 404
  return Response.json(result, { status })
}
