import { apiFetch } from "@/lib/api/http"
import type { CreateAccountInput, UpdateAccountInput } from "@/lib/validators/account"
import type { AccountDto } from "@/types/api"

export function getAccounts(): Promise<AccountDto[]> {
  return apiFetch("/api/v1/accounts")
}

export function createAccount(input: CreateAccountInput): Promise<AccountDto> {
  return apiFetch("/api/v1/accounts", { method: "POST", body: JSON.stringify(input) })
}

export function updateAccount(
  id: string,
  input: UpdateAccountInput,
): Promise<AccountDto> {
  return apiFetch(`/api/v1/accounts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  })
}

export function deleteAccount(id: string): Promise<{ id: string }> {
  return apiFetch(`/api/v1/accounts/${id}`, { method: "DELETE" })
}

export function reorderAccounts(
  items: { id: string; sortOrder: number }[],
): Promise<{ updated: number }> {
  return apiFetch("/api/v1/accounts/order", {
    method: "PATCH",
    body: JSON.stringify({ items }),
  })
}
