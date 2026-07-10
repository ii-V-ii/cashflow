import { describe, expect, test } from "vitest"

import {
  addMonthsClamped,
  daysBetween,
  getSavingsMaturityInfo,
} from "@/lib/calculations/deposit-maturity"

/**
 * 적금 만기 D-day·예상 이자 — 계좌 화면 배지용 순수 함수 (PRD §3.9, UI.md 계좌/카드).
 * 이자 수식은 deposit-calculator를 재사용하고, 여기서는 만기일 계산과 조합만 다룬다.
 */

describe("addMonthsClamped", () => {
  test("단순 가산: 2026-01-15 + 12개월 → 2027-01-15", () => {
    expect(addMonthsClamped("2026-01-15", 12)).toBe("2027-01-15")
  })

  test("월말 보정: 2025-08-31 + 6개월 → 2026-02-28", () => {
    expect(addMonthsClamped("2025-08-31", 6)).toBe("2026-02-28")
  })

  test("윤년 월말: 2023-12-31 + 2개월 → 2024-02-29", () => {
    expect(addMonthsClamped("2023-12-31", 2)).toBe("2024-02-29")
  })
})

describe("daysBetween", () => {
  test("미래 날짜 → 양수", () => {
    expect(daysBetween("2026-07-10", "2026-07-20")).toBe(10)
  })

  test("같은 날 → 0, 과거 → 음수", () => {
    expect(daysBetween("2026-07-10", "2026-07-10")).toBe(0)
    expect(daysBetween("2026-07-10", "2026-07-01")).toBe(-9)
  })
})

describe("getSavingsMaturityInfo", () => {
  const installmentAccount = {
    depositType: "installment" as const,
    termMonths: 24,
    interestRate: 4.5,
    taxType: "tax_free" as const,
    openDate: "2026-01-15",
    monthlyPayment: 200_000,
    balance: 1_200_000,
  }

  test("적립식 — 만기일·D-day·세후 이자·만기 수령액", () => {
    const info = getSavingsMaturityInfo(installmentAccount, "2026-07-10")

    expect(info).not.toBeNull()
    expect(info?.maturityDate).toBe("2028-01-15")
    expect(info?.dDay).toBe(554)
    // 적금 단리: 200,000 × (0.045/12) × (24×25/2) = 225,000 (tax_free → 세금 0)
    expect(info?.expectedInterest).toBe(225_000)
    expect(info?.totalAtMaturity).toBe(200_000 * 24 + 225_000)
  })

  test("거치식 — 현재 잔액을 원금으로 계산", () => {
    const info = getSavingsMaturityInfo(
      {
        depositType: "lump_sum",
        termMonths: 12,
        interestRate: 3.0,
        taxType: "normal",
        openDate: "2026-01-01",
        monthlyPayment: null,
        balance: 10_000_000,
      },
      "2026-07-10",
    )

    // 이자 = 10,000,000 × 3% × 1년 = 300,000 → 세금 15.4% = 46,200
    expect(info?.maturityDate).toBe("2027-01-01")
    expect(info?.expectedInterest).toBe(300_000 - 46_200)
    expect(info?.totalAtMaturity).toBe(10_000_000 + 300_000 - 46_200)
  })

  test("taxType 미지정 → normal(15.4%)로 계산", () => {
    const info = getSavingsMaturityInfo(
      { ...installmentAccount, taxType: null },
      "2026-07-10",
    )
    // 세전 225,000 → 세금 round(225000×0.154)=34,650
    expect(info?.expectedInterest).toBe(225_000 - 34_650)
  })

  test("필수 정보(개설일·기간·이율) 없으면 null", () => {
    expect(
      getSavingsMaturityInfo({ ...installmentAccount, openDate: null }, "2026-07-10"),
    ).toBeNull()
    expect(
      getSavingsMaturityInfo({ ...installmentAccount, termMonths: null }, "2026-07-10"),
    ).toBeNull()
    expect(
      getSavingsMaturityInfo(
        { ...installmentAccount, interestRate: null },
        "2026-07-10",
      ),
    ).toBeNull()
    expect(
      getSavingsMaturityInfo(
        { ...installmentAccount, depositType: null },
        "2026-07-10",
      ),
    ).toBeNull()
  })

  test("적립식인데 월납입액이 없으면 null", () => {
    expect(
      getSavingsMaturityInfo(
        { ...installmentAccount, monthlyPayment: null },
        "2026-07-10",
      ),
    ).toBeNull()
  })

  test("만기 경과 → 음수 D-day 유지 (UI에서 '만기 도래' 처리)", () => {
    const info = getSavingsMaturityInfo(
      { ...installmentAccount, openDate: "2024-01-15", termMonths: 12 },
      "2026-07-10",
    )
    expect(info?.maturityDate).toBe("2025-01-15")
    expect(info?.dDay).toBeLessThan(0)
  })
})
