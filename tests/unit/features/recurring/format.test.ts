import { describe, expect, test } from "vitest"

import { frequencyLabel } from "@/features/recurring/format"

describe("frequencyLabel", () => {
  test.each([
    ["daily", 1, "매일"],
    ["weekly", 1, "매주"],
    ["monthly", 1, "매월"],
    ["yearly", 1, "매년"],
    ["daily", 3, "3일마다"],
    ["weekly", 2, "2주마다"],
    ["monthly", 6, "6개월마다"],
    ["yearly", 2, "2년마다"],
  ] as const)("%s × %i → %s", (frequency, interval, expected) => {
    expect(frequencyLabel(frequency, interval)).toBe(expected)
  })
})
