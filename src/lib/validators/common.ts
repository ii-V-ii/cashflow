import { z } from "zod"

/** 형식이 맞아도 달력에 없는 날짜(예: 2026-02-30)를 거부한다 (DB date 캐스팅 500 방지) */
function isValidCalendarDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

/** 'YYYY-MM-DD' 날짜 문자열 (API.md §1.3) — 달력 유효성 포함 */
export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜는 YYYY-MM-DD 형식이어야 합니다")
  .refine(isValidCalendarDate, "존재하지 않는 날짜입니다")

/** KRW 금액 상한 — 10조 원 (SEC-M2: 비정상 초대형 값 차단) */
export const MAX_KRW_AMOUNT = 10_000_000_000_000

/** KRW 금액 — 정수, 소수점 금지, 10조 원 상한 (API.md §1.3, SEC-M2) */
export const krwAmount = z
  .number()
  .int("금액은 정수여야 합니다")
  .max(MAX_KRW_AMOUNT, "금액은 10조 원을 초과할 수 없습니다")

/** 페이지네이션 쿼리 (기본 page=1, limit=20, 최대 100 — API.md §1.3) */
export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

/** 드래그 정렬 일괄 저장 본문 (API.md §3.6 / §4.5 공통) */
export const reorderSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.uuid(),
        sortOrder: z.number().int().min(0),
      }),
    )
    .min(1, "정렬할 항목이 필요합니다"),
})

export type ReorderInput = z.infer<typeof reorderSchema>
