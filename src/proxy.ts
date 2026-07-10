import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

/**
 * 라우트 보호 + 세션 갱신 (Next.js 16: middleware → proxy 파일 규약).
 * - (app) 페이지: 미인증 → /login 리다이렉트
 * - /api/v1/**: 미인증 → 401 UNAUTHORIZED envelope (라우트 핸들러도 재검증 — 이중 방어)
 * - /login: 인증 상태면 홈으로
 */
const PUBLIC_API_PATHS = new Set(["/api/v1/health"])

export default async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isApi = pathname.startsWith("/api/v1")

  if (!user) {
    if (isApi && !PUBLIC_API_PATHS.has(pathname)) {
      return Response.json(
        {
          success: false,
          error: { code: "UNAUTHORIZED", message: "로그인이 필요합니다" },
        },
        { status: 401 },
      )
    }
    if (!isApi && pathname !== "/login") {
      const url = request.nextUrl.clone()
      url.pathname = "/login"
      url.search = ""
      return NextResponse.redirect(url)
    }
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone()
    url.pathname = "/"
    url.search = ""
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  // 정적 자산·PWA 파일 제외
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|manifest.json|sw.js|icons/|.*\\.(?:png|svg|ico|jpg|webp)$).*)",
  ],
}
