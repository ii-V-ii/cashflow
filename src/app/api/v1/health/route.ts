import { jsonSuccess } from "@/server/api-response"

export async function GET() {
  return jsonSuccess({ status: "ok" })
}
