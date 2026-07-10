"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createSupabaseBrowserClient } from "@/lib/supabase-browser"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      const supabase = createSupabaseBrowserClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (signInError) {
        setError("이메일 또는 비밀번호가 올바르지 않습니다")
        return
      }
      router.replace("/")
      router.refresh()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-surface px-6">
      <section
        aria-labelledby="login-heading"
        className="w-full max-w-sm rounded-2xl bg-surface-raised p-8 ring-1 ring-hairline"
      >
        <header className="mb-8">
          <h1 id="login-heading" className="text-2xl font-semibold text-ink">
            금전출납부
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            이메일과 비밀번호로 로그인하세요
          </p>
        </header>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            이메일
            <Input
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-11"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            비밀번호
            <Input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-11"
            />
          </label>

          {error && (
            <p role="alert" className="text-sm text-expense-fg">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 h-11 w-full bg-ink text-surface-raised hover:bg-ink/90"
          >
            {isSubmitting ? "로그인 중…" : "로그인"}
          </Button>
        </form>
      </section>
    </main>
  )
}
