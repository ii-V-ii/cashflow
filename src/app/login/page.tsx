"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const ERROR_MESSAGES: Record<string, string> = {
  "Invalid login credentials": "이메일 또는 비밀번호가 올바르지 않습니다.",
  "Email not confirmed": "이메일 인증이 완료되지 않았습니다.",
  "User not found": "등록되지 않은 이메일입니다.",
  "Too many requests": "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.",
}

function getErrorMessage(supabaseMessage: string): string {
  return ERROR_MESSAGES[supabaseMessage] ?? `로그인 실패: ${supabaseMessage}`
}

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const timeout = setTimeout(() => {
      setError("응답 시간이 초과되었습니다. 네트워크를 확인해주세요.")
      setLoading(false)
    }, 10000)

    try {
      const supabase = createClient()
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      clearTimeout(timeout)

      if (authError) {
        const message = getErrorMessage(authError.message)
        setError(message)
        setLoading(false)
        return
      }

      router.push("/")
      router.refresh()
    } catch (err) {
      clearTimeout(timeout)
      const msg = err instanceof Error ? err.message : "알 수 없는 오류"
      setError(`서버에 연결할 수 없습니다: ${msg}`)
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">금전출납부</CardTitle>
          <p className="text-sm text-muted-foreground">
            로그인하여 시작하세요
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="email" className="text-sm font-medium">
                이메일
              </label>
              <Input
                id="email"
                type="email"
                placeholder="email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="password" className="text-sm font-medium">
                비밀번호
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            {error && (
              <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3">
                <p className="text-sm text-destructive font-medium">{error}</p>
              </div>
            )}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "로그인 중..." : "로그인"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
