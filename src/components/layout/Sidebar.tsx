"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  ArrowLeftRight,
  PiggyBank,
  ClipboardCheck,
  Landmark,
  Wallet,
  TrendingUp,
  BarChart3,
  FileBarChart,
  Tags,
  ChevronsLeft,
  ChevronsRight,
  LogOut,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { label: "대시보드", href: "/", icon: LayoutDashboard },
  { label: "거래", href: "/transactions", icon: ArrowLeftRight },
  { label: "예산", href: "/budgets", icon: PiggyBank },
  { label: "결산", href: "/settlements", icon: ClipboardCheck },
  { label: "계좌/카드", href: "/accounts", icon: Landmark },
  { label: "자산", href: "/assets", icon: Wallet },
  { label: "투자수익", href: "/investments", icon: BarChart3 },
  { label: "예측", href: "/forecast", icon: TrendingUp },
  { label: "카테고리", href: "/categories", icon: Tags },
  { label: "보고서", href: "/reports", icon: FileBarChart },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200",
        collapsed ? "w-16" : "w-56"
      )}
    >
      <div
        className={cn(
          "flex h-14 items-center border-b border-sidebar-border px-3",
          collapsed ? "justify-center" : "justify-between"
        )}
      >
        {!collapsed && (
          <span className="text-sm font-semibold text-sidebar-foreground truncate">
            금전출납부
          </span>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggle}
          aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
          className="text-sidebar-foreground"
        >
          {collapsed ? (
            <ChevronsRight className="size-4" />
          ) : (
            <ChevronsLeft className="size-4" />
          )}
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <nav className="flex flex-col gap-1 p-2" aria-label="메인 메뉴">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;

            const link = (
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground",
                  collapsed && "justify-center px-0"
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="size-5 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );

            if (collapsed) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger render={link} />
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              );
            }

            return <div key={item.href}>{link}</div>;
          })}
        </nav>
      </ScrollArea>

      <Separator />
      <div className="p-2">
        <LogoutButton collapsed={collapsed} />
        {!collapsed && (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            Cashflow v0.1
          </p>
        )}
      </div>
    </aside>
  );
}

function LogoutButton({ collapsed }: { collapsed?: boolean }) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const button = (
    <button
      onClick={handleLogout}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors w-full",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        "text-sidebar-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      <LogOut className="size-5 shrink-0" />
      {!collapsed && <span>로그아웃</span>}
    </button>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger render={button} />
        <TooltipContent side="right">로그아웃</TooltipContent>
      </Tooltip>
    );
  }

  return button;
}

export function MobileSidebarContent({
  onNavigate,
}: {
  onNavigate: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 p-2" aria-label="메인 메뉴">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors",
              "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              "active:bg-sidebar-accent",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground"
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon className="size-5 shrink-0" />
            <span>{item.label}</span>
          </Link>
        );
      })}
      <Separator className="my-2" />
      <LogoutButton />
    </nav>
  );
}
