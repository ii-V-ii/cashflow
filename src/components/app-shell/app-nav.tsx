"use client"

import {
  HomeIcon,
  LayoutGridIcon,
  PiggyBankIcon,
  PlusIcon,
  ReceiptTextIcon,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"
import { useUiStore } from "@/stores/ui-store"

const NAV_ITEMS = [
  { href: "/", label: "홈", icon: HomeIcon },
  { href: "/transactions", label: "거래", icon: ReceiptTextIcon },
  { href: "/budgets", label: "예산", icon: PiggyBankIcon },
  { href: "/menu", label: "전체", icon: LayoutGridIcon },
] as const

function isActivePath(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href)
}

/** 모바일 하단 탭 바 5슬롯 + 중앙 ＋ (UI.md §4.1) */
export function BottomTabBar() {
  const pathname = usePathname()
  const openQuickAdd = useUiStore((state) => state.openQuickAdd)
  const [home, transactions, budgets, menu] = NAV_ITEMS

  const renderTab = ({ href, label, icon: Icon }: (typeof NAV_ITEMS)[number]) => {
    const active = isActivePath(pathname, href)
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors",
          active ? "text-ink" : "text-ink-muted",
        )}
      >
        <Icon className={cn("size-5", active && "stroke-[2.4]")} />
        {label}
      </Link>
    )
  }

  return (
    <nav
      aria-label="주요 메뉴"
      className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(var(--nav-height)+env(safe-area-inset-bottom))] items-stretch border-t border-hairline bg-surface-raised pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {renderTab(home)}
      {renderTab(transactions)}
      <div className="flex flex-1 items-center justify-center">
        <button
          type="button"
          onClick={openQuickAdd}
          aria-label="빠른 거래 입력"
          data-testid="quick-add-button"
          className="flex size-11 -translate-y-3 items-center justify-center rounded-full bg-ink text-surface-raised shadow-lg transition-transform active:scale-95"
        >
          <PlusIcon className="size-6" />
        </button>
      </div>
      {renderTab(budgets)}
      {renderTab(menu)}
    </nav>
  )
}

/** 데스크톱(≥md) 사이드 내비 + 상시 새 거래 버튼 (UI.md §4.1) */
export function SidebarNav() {
  const pathname = usePathname()
  const openQuickAdd = useUiStore((state) => state.openQuickAdd)

  const links = [
    ...NAV_ITEMS.slice(0, 3),
    { href: "/accounts", label: "계좌", icon: LayoutGridIcon },
    { href: "/categories", label: "카테고리", icon: LayoutGridIcon },
    NAV_ITEMS[3],
  ]

  return (
    <aside className="sticky top-0 hidden h-dvh w-52 shrink-0 flex-col gap-1 border-r border-hairline bg-surface-raised p-4 md:flex">
      <p className="mb-4 px-2 text-lg font-semibold text-ink">금전출납부</p>
      <button
        type="button"
        onClick={openQuickAdd}
        data-testid="quick-add-button-desktop"
        className="mb-4 flex h-11 items-center justify-center gap-1.5 rounded-xl bg-ink text-sm font-medium text-surface-raised transition-colors hover:bg-ink/90"
      >
        <PlusIcon className="size-4" /> 새 거래
      </button>
      {links.map(({ href, label, icon: Icon }) => {
        const active = isActivePath(pathname, href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-11 items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition-colors",
              active
                ? "bg-surface-sunken text-ink"
                : "text-ink-muted hover:bg-surface-sunken/60 hover:text-ink",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        )
      })}
    </aside>
  )
}
