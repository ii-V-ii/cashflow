// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { MenuScreen } from "@/features/menu/components/menu-screen"
import { useToastStore } from "@/stores/toast-store"

const replaceMock = vi.fn()
const refreshMock = vi.fn()
const signOutMock = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, refresh: refreshMock }),
}))

vi.mock("@/lib/supabase-browser", () => ({
  createSupabaseBrowserClient: () => ({ auth: { signOut: signOutMock } }),
}))

describe("MenuScreen 로그아웃", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useToastStore.setState({ toasts: [] })
  })

  it("성공 시 /login으로 이동한다", async () => {
    signOutMock.mockResolvedValue({ error: null })
    render(<MenuScreen />)

    fireEvent.click(screen.getByTestId("sign-out"))

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/login"))
    expect(refreshMock).toHaveBeenCalled()
  })

  it("실패({ error }) 시 에러 토스트를 띄우고 버튼을 복원한다", async () => {
    signOutMock.mockResolvedValue({ error: new Error("network down") })
    render(<MenuScreen />)

    const button = screen.getByTestId("sign-out")
    fireEvent.click(button)

    await waitFor(() =>
      expect(
        useToastStore.getState().toasts.some((toast) => toast.variant === "error"),
      ).toBe(true),
    )
    expect(replaceMock).not.toHaveBeenCalled()
    expect(button).toHaveProperty("disabled", false)
    expect(button.textContent).toContain("로그아웃")
    expect(button.textContent).not.toContain("로그아웃 중")
  })

  it("실패(reject) 시에도 에러 토스트를 띄우고 버튼을 복원한다", async () => {
    signOutMock.mockRejectedValue(new Error("fetch failed"))
    render(<MenuScreen />)

    const button = screen.getByTestId("sign-out")
    fireEvent.click(button)

    await waitFor(() =>
      expect(
        useToastStore.getState().toasts.some((toast) => toast.variant === "error"),
      ).toBe(true),
    )
    expect(replaceMock).not.toHaveBeenCalled()
    expect(button).toHaveProperty("disabled", false)
    expect(button.textContent).not.toContain("로그아웃 중")
  })
})
