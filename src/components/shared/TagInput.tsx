"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { useTags } from "@/hooks/use-tags"

const MAX_TAGS = 10
const DEBOUNCE_MS = 300

interface TagInputProps {
  value: string[]
  onChange: (tags: string[]) => void
}

export function TagInput({ value, onChange }: TagInputProps) {
  const [input, setInput] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 디바운스
  useEffect(() => {
    if (!input.trim()) {
      setDebouncedQuery("")
      return
    }
    const timer = setTimeout(() => setDebouncedQuery(input.trim()), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [input])

  const { data: suggestions } = useTags(debouncedQuery || undefined)

  const filtered = suggestions?.filter(
    (tag) => !value.includes(tag.name),
  ) ?? []

  const addTag = useCallback(
    (name: string) => {
      const trimmed = name.trim()
      if (!trimmed) return
      if (value.includes(trimmed)) return
      if (value.length >= MAX_TAGS) return
      onChange([...value, trimmed])
      setInput("")
      setDebouncedQuery("")
      setHighlightIndex(-1)
    },
    [value, onChange],
  )

  const removeTag = useCallback(
    (name: string) => {
      onChange(value.filter((t) => t !== name))
    },
    [value, onChange],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.nativeEvent.isComposing) return
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault()
        if (highlightIndex >= 0 && highlightIndex < filtered.length) {
          addTag(filtered[highlightIndex].name)
        } else {
          addTag(input)
        }
      } else if (e.key === "Backspace" && !input && value.length > 0) {
        removeTag(value[value.length - 1])
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setHighlightIndex((i) => Math.max(i - 1, -1))
      } else if (e.key === "Escape") {
        setShowSuggestions(false)
        setHighlightIndex(-1)
      }
    },
    [input, value, filtered, highlightIndex, addTag, removeTag],
  )

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
        setHighlightIndex(-1)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const showDropdown = showSuggestions && filtered.length > 0 && input.trim().length > 0

  return (
    <div ref={containerRef} className="relative">
      <div
        className="flex flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent px-2 py-1 min-h-8 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-0.5 pr-1">
            {tag}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                removeTag(tag)
              }}
              className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20 min-w-[22px] min-h-[22px] flex items-center justify-center"
              aria-label={`${tag} 삭제`}
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        {value.length < MAX_TAGS && (
          <input
            ref={inputRef}
            type="text"
            className="flex-1 min-w-20 bg-transparent text-sm outline-none placeholder:text-muted-foreground py-0.5"
            placeholder={value.length === 0 ? "태그 입력 (Enter 또는 쉼표로 추가)" : ""}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              setShowSuggestions(true)
              setHighlightIndex(-1)
            }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={handleKeyDown}
          />
        )}
      </div>

      {showDropdown && (
        <ul className="absolute z-50 mt-1 w-full rounded-lg border border-input bg-popover p-1 shadow-md max-h-40 overflow-y-auto">
          {filtered.slice(0, 10).map((tag, i) => (
            <li
              key={tag.id}
              className={`cursor-pointer rounded-md px-2 py-1.5 text-sm min-h-[36px] flex items-center ${
                i === highlightIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
              }`}
              onMouseDown={(e) => {
                e.preventDefault()
                addTag(tag.name)
              }}
              onMouseEnter={() => setHighlightIndex(i)}
            >
              {tag.name}
            </li>
          ))}
        </ul>
      )}

      {value.length >= MAX_TAGS && (
        <p className="text-xs text-muted-foreground mt-1">
          최대 {MAX_TAGS}개까지 추가할 수 있습니다
        </p>
      )}
    </div>
  )
}
