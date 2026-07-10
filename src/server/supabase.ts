import "server-only"

import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} environment variable is not set`)
  }
  return value
}

/**
 * 라우트 핸들러/RSC용 Supabase 서버 클라이언트 (@supabase/ssr 쿠키 세션).
 * 세션 검증은 로컬 JWT 검증으로 DB 왕복이 없다 (ARCHITECTURE.md §8).
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // RSC에서는 쿠키 쓰기가 불가 — proxy(세션 갱신 담당)가 있으므로 무시 가능
          }
        },
      },
    },
  )
}
