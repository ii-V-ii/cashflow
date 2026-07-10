import { Toaster } from "@/components/ui/toaster"
import { BottomTabBar, SidebarNav } from "@/components/app-shell/app-nav"
import { QuickAddSheet } from "@/features/transactions/components/quick-add-sheet"
import { Providers } from "@/app/providers"

/** 앱 셸 — 모바일 하단 탭 바 + 데스크톱 사이드 내비 (UI.md §4) */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <div className="flex min-h-dvh bg-surface text-ink">
        <SidebarNav />
        <div className="min-w-0 flex-1 pb-[calc(var(--nav-height)+env(safe-area-inset-bottom)+16px)] md:pb-8">
          {children}
        </div>
        <BottomTabBar />
        <QuickAddSheet />
        <Toaster />
      </div>
    </Providers>
  )
}
