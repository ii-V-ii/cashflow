import "server-only"

import { createSupabaseServerClient } from "@/server/supabase"

export interface AuthUser {
  id: string
  email: string | null
}

/**
 * Supabase 세션 검증 헬퍼 (ARCHITECTURE.md §3 server/auth.ts).
 * 세션이 없거나 검증 실패 시 null — 라우트는 401 UNAUTHORIZED envelope으로 응답한다.
 */
export async function getAuthUser(): Promise<AuthUser | null> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) {
      return null
    }
    return { id: data.user.id, email: data.user.email ?? null }
  } catch {
    // 요청 컨텍스트 밖(cookies 불가) 등 — 인증 실패로 간주 (fail-closed)
    return null
  }
}
