import { AssetDetailScreen } from "@/features/assets/components/asset-detail-screen"

export const metadata = { title: "자산 상세 - 금전출납부" }

/** Next.js 16: params는 Promise (route.md) */
export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <AssetDetailScreen assetId={id} />
}
