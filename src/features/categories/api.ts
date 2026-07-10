import { apiFetch } from "@/lib/api/http"
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
} from "@/lib/validators/category"
import type { CategoryDto } from "@/types/api"

export function getCategories(type?: "income" | "expense"): Promise<CategoryDto[]> {
  const params = type ? `?type=${type}` : ""
  return apiFetch(`/api/v1/categories${params}`)
}

export function createCategory(input: CreateCategoryInput): Promise<CategoryDto> {
  return apiFetch("/api/v1/categories", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function updateCategory(
  id: string,
  input: UpdateCategoryInput,
): Promise<CategoryDto> {
  return apiFetch(`/api/v1/categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  })
}

export function deleteCategory(id: string): Promise<{ id: string }> {
  return apiFetch(`/api/v1/categories/${id}`, { method: "DELETE" })
}

export function reorderCategories(
  items: { id: string; sortOrder: number }[],
): Promise<{ updated: number }> {
  return apiFetch("/api/v1/categories/order", {
    method: "PATCH",
    body: JSON.stringify({ items }),
  })
}
