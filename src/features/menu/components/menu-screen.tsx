"use client"

import {
  FolderTreeIcon,
  LandmarkIcon,
  LogOutIcon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { createSupabaseBrowserClient } from "@/lib/supabase-browser"

const MENU_LINKS = [
  { href: "/accounts", label: "계좌", icon: LandmarkIcon, ready: true },
  { href: "/categories", label: "카테고리", icon: FolderTreeIcon, ready: true },
] as const

const UPCOMING = ["결산", "자산", "투자", "예측", "보고서", "설정"] as const

/** 전체 메뉴 그리드 시트 — 저빈도 메뉴 격리 (UI.md §4.1) + 로그아웃 */
export function MenuScreen() {
  const router = useRouter()
  const [isSigningOut, setIsSigningOut] = useState(false)

  async function handleSignOut() {
    setIsSigningOut(true)
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.replace("/login")
    router.refresh()
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pt-6">
      <h1 className="px-1 text-lg font-semibold text-ink">전체</h1>

      <section aria-label="메뉴" className="grid grid-cols-3 gap-2">
        {MENU_LINKS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl bg-surface-raised text-sm font-medium text-ink ring-1 ring-hairline transition-colors hover:bg-surface-sunken"
          >
            <Icon className="size-5 text-ink-muted" />
            {label}
          </Link>
        ))}
        {UPCOMING.map((label) => (
          <div
            key={label}
            aria-disabled
            className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-xl bg-surface-sunken/60 text-sm text-ink-muted/60"
          >
            {label}
            <span className="text-[10px]">준비 중</span>
          </div>
        ))}
      </section>

      <button
        type="button"
        onClick={handleSignOut}
        disabled={isSigningOut}
        data-testid="sign-out"
        className="flex h-12 items-center justify-center gap-2 rounded-xl border border-hairline text-sm font-medium text-ink-muted transition-colors hover:bg-surface-sunken"
      >
        <LogOutIcon className="size-4" />
        {isSigningOut ? "로그아웃 중…" : "로그아웃"}
      </button>
    </main>
  )
}
