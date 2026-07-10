"use client"

import { cn } from "@/lib/utils"
import { useToastStore } from "@/stores/toast-store"

export function Toaster() {
  const toasts = useToastStore((state) => state.toasts)
  const dismiss = useToastStore((state) => state.dismiss)

  if (toasts.length === 0) return null

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--nav-height)+env(safe-area-inset-bottom)+12px)] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6"
    >
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => dismiss(toast.id)}
          className={cn(
            "pointer-events-auto min-h-11 max-w-sm rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg",
            toast.variant === "error"
              ? "bg-expense text-white"
              : "bg-ink text-surface-raised",
          )}
          data-testid="toast"
        >
          {toast.message}
        </button>
      ))}
    </div>
  )
}
