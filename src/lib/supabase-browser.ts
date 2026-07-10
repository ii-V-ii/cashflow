"use client"

import { createBrowserClient } from "@supabase/ssr"

/** 브라우저용 Supabase 클라이언트 (로그인/로그아웃 전용 — 데이터는 전부 /api/v1 경유) */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
