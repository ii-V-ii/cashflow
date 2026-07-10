import type { DepositType, TaxType } from "@/types"

import {
  calculateInstallmentSavings,
  calculateLumpSumDeposit,
} from "./deposit-calculator"

/**
 * 적금·예금 만기 D-day와 예상 이자 — 계좌 화면 배지용 순수 함수 (PRD §3.9).
 * 이자 수식은 deposit-calculator 재사용 — 여기서는 만기일 계산과 조합만 담당.
 */

const DAY_MS = 86_400_000
const DEFAULT_TAX_TYPE: TaxType = "normal"

/** YYYY-MM-DD + n개월 — 월말 보정(1/31+1개월 → 2/28) 포함 */
export function addMonthsClamped(dateYmd: string, months: number): string {
  const date = new Date(dateYmd + "T00:00:00")
  const originalDay = date.getDate()
  date.setMonth(date.getMonth() + months)
  if (date.getDate() !== originalDay) {
    date.setDate(0) // 이전 달 마지막 날로 클램프
  }
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/** from → to 일수 차 (미래 양수, 과거 음수) */
export function daysBetween(fromYmd: string, toYmd: string): number {
  const from = new Date(fromYmd + "T00:00:00")
  const to = new Date(toYmd + "T00:00:00")
  return Math.round((to.getTime() - from.getTime()) / DAY_MS)
}

export interface SavingsAccountLike {
  readonly depositType: DepositType | null
  readonly termMonths: number | null
  readonly interestRate: number | null
  readonly taxType: TaxType | null
  readonly openDate: string | null
  readonly monthlyPayment: number | null
  readonly balance: number
}

export interface SavingsMaturityInfo {
  readonly maturityDate: string
  /** 오늘 기준 만기까지 남은 일수 (경과 시 음수) */
  readonly dDay: number
  /** 세후 예상 이자 */
  readonly expectedInterest: number
  readonly totalAtMaturity: number
}

/**
 * 만기 정보 계산. 필수 정보(유형·개설일·기간·이율)가 없으면 null —
 * UI는 null이면 배지를 렌더링하지 않는다.
 */
export function getSavingsMaturityInfo(
  account: SavingsAccountLike,
  todayYmd: string,
): SavingsMaturityInfo | null {
  const { depositType, termMonths, interestRate, openDate } = account
  if (!depositType || !openDate || termMonths === null || interestRate === null) {
    return null
  }

  const taxType = account.taxType ?? DEFAULT_TAX_TYPE
  const maturityDate = addMonthsClamped(openDate, termMonths)
  const dDay = daysBetween(todayYmd, maturityDate)

  if (depositType === "installment") {
    if (account.monthlyPayment === null) return null
    const result = calculateInstallmentSavings(
      account.monthlyPayment,
      interestRate,
      termMonths,
      taxType,
    )
    return {
      maturityDate,
      dDay,
      expectedInterest: result.afterTaxInterest,
      totalAtMaturity: result.totalAtMaturity,
    }
  }

  const result = calculateLumpSumDeposit(
    account.balance,
    interestRate,
    termMonths,
    taxType,
  )
  return {
    maturityDate,
    dDay,
    expectedInterest: result.afterTaxInterest,
    totalAtMaturity: result.totalAtMaturity,
  }
}
