"use client"

import { useEffect, useState } from "react"

/**
 * Returns a value that updates only after `delay` ms have elapsed without further changes.
 * Useful for debouncing input-driven side effects (search queries, autosuggest, etc).
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
