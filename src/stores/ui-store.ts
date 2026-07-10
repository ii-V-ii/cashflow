"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"

/** 클라이언트 UI 상태만 — 서버 상태 미러링 금지 (ARCHITECTURE.md §3 stores) */
interface UiState {
  isQuickAddOpen: boolean
  openQuickAdd: () => void
  closeQuickAdd: () => void
  /** 빠른 입력 기본값: 마지막 사용 계좌·유형 기억 (UI.md §4.2) */
  lastAccountId: string | null
  lastType: "income" | "expense" | "transfer"
  rememberDefaults: (accountId: string, type: UiState["lastType"]) => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      isQuickAddOpen: false,
      openQuickAdd: () => set({ isQuickAddOpen: true }),
      closeQuickAdd: () => set({ isQuickAddOpen: false }),
      lastAccountId: null,
      lastType: "expense",
      rememberDefaults: (accountId, type) =>
        set({ lastAccountId: accountId, lastType: type }),
    }),
    {
      name: "cashflow-ui",
      partialize: (state) => ({
        lastAccountId: state.lastAccountId,
        lastType: state.lastType,
      }),
    },
  ),
)
