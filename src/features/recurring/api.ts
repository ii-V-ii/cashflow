import { apiFetch } from "@/lib/api/http"
import type {
  CreateRecurringInput,
  UpdateRecurringInput,
} from "@/lib/validators/recurring"
import type { RecurringDto, RecurringProcessResultDto } from "@/types/api"

export function getRecurringList(): Promise<RecurringDto[]> {
  return apiFetch("/api/v1/recurring")
}

export function createRecurring(
  input: CreateRecurringInput,
): Promise<RecurringDto> {
  return apiFetch("/api/v1/recurring", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function updateRecurring(
  id: string,
  input: UpdateRecurringInput,
): Promise<RecurringDto> {
  return apiFetch(`/api/v1/recurring/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  })
}

export function deleteRecurring(id: string): Promise<{ id: string }> {
  return apiFetch(`/api/v1/recurring/${id}`, { method: "DELETE" })
}

/** 온디맨드 실행 보정 (API.md §12.6) — 멱등 */
export function processRecurring(): Promise<RecurringProcessResultDto> {
  return apiFetch("/api/v1/recurring/process", { method: "POST" })
}
