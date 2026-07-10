"use client"

import { create } from "zustand"

export interface Toast {
  id: string
  message: string
  variant: "default" | "error"
}

interface ToastState {
  toasts: Toast[]
  show: (message: string, variant?: Toast["variant"]) => void
  dismiss: (id: string) => void
}

const TOAST_DURATION_MS = 3000

/** 앱 공용 토스트 (네이티브 alert 금지 — UI.md §2.7) */
export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  show: (message, variant = "default") => {
    const id = crypto.randomUUID()
    set((state) => ({ toasts: [...state.toasts, { id, message, variant }] }))
    setTimeout(() => get().dismiss(id), TOAST_DURATION_MS)
  },
  dismiss: (id) =>
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}))
