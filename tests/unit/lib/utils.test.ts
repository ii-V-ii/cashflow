import { describe, expect, test } from "vitest"

import { cn } from "@/lib/utils"

describe("cn", () => {
  test("merges class names and drops falsy values", () => {
    expect(cn("a", false && "b", undefined, "c")).toBe("a c")
  })

  test("resolves conflicting tailwind classes (last wins)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4")
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500")
  })

  test("supports conditional object syntax", () => {
    expect(cn({ "font-bold": true, hidden: false })).toBe("font-bold")
  })
})
