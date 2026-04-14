"use client"

import { useQuery } from "@tanstack/react-query"
import { apiGet } from "@/lib/api-client"
import type { Tag } from "@/types"

export function useTags(q?: string) {
  return useQuery({
    queryKey: ["tags", q],
    queryFn: () => apiGet<Tag[]>(`/api/tags${q ? `?q=${q}` : ""}`),
  })
}
