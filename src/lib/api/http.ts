/** typed fetch — envelope 해석 + 에러 정규화 (각 feature api.ts 공용) */

export class ApiClientError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = "ApiClientError"
    this.status = status
    this.code = code
  }
}

interface Envelope<T> {
  success: boolean
  data?: T
  error?: { code: string; message: string }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body !== undefined ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  })

  let body: Envelope<T> | null = null
  try {
    body = (await response.json()) as Envelope<T>
  } catch {
    body = null
  }

  if (!response.ok || !body || body.success !== true) {
    throw new ApiClientError(
      response.status,
      body?.error?.code ?? "UNKNOWN_ERROR",
      body?.error?.message ?? "요청에 실패했습니다",
    )
  }
  return body.data as T
}
